import "server-only";
import { z } from "zod";
import { buildConfigFromRows, getConfig, reloadSystemConfig } from "@/lib/config";
import { prisma } from "@/lib/db/business";
import { getTransporter } from "@/lib/mail";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

/**
 * 设置保存与测试发信(T030;api-admin-m4 契约):
 * 组级全量提交——非空敏感字段=覆写,空/缺省=保持不变;
 * 先以候选行整表校验(buildConfigFromRows)再落库,校验失败零写入;
 * upsert → reloadSystemConfig 热生效 → 审计 SETTINGS_CHANGED(只落键名/diff 标记,任何值不落)。
 * sendTestMail 直发不入 outbox,业务成败回显不抛 5xx,错误摘要按配置值脱敏。
 */

export type SaveSettingsResult =
  | { ok: true }
  | { ok: false; code: "VALIDATION_FAILED" | "TURNSTILE_KEYS_REQUIRED"; message: string };

/** 各组 zod:敏感字段(password/secretKey/apiPassword)optional——空/缺省语义在下方 keep 逻辑处理 */
const groupSchemas = {
  smtp: z.object({
    host: z.string().min(1, "host 必填"),
    port: z.coerce.number().int().positive(),
    user: z.string().default(""),
    password: z.string().optional(),
    from: z.string().email(),
  }),
  turnstile: z.object({
    enabled: z.boolean(),
    siteKey: z.string().default(""),
    secretKey: z.string().optional(),
  }),
  security: z.object({
    loginMaxFails: z.coerce.number().int().positive(),
    loginWindowSec: z.coerce.number().int().positive(),
    loginLockSec: z.coerce.number().int().positive(),
  }),
  notify: z.object({
    pointEmailThreshold: z.coerce.number().int().min(0),
  }),
  umami: z.object({
    scriptUrl: z.string().url(),
    websiteId: z.string().min(1),
    apiUrl: z.string().url(),
    apiUsername: z.string().min(1),
    apiPassword: z.string().optional(),
  }),
} as const;

/** 字段 → system_config 键;sensitive 键空输入=保持原值 */
const groupKeys: Record<keyof typeof groupSchemas, Record<string, string>> = {
  smtp: {
    host: "smtp.host",
    port: "smtp.port",
    user: "smtp.user",
    password: "smtp.password",
    from: "smtp.from",
  },
  turnstile: {
    enabled: "turnstile.enabled",
    siteKey: "turnstile.siteKey",
    secretKey: "turnstile.secretKey",
  },
  security: {
    loginMaxFails: "security.loginMaxFails",
    loginWindowSec: "security.loginWindowSec",
    loginLockSec: "security.loginLockSec",
  },
  notify: { pointEmailThreshold: "notify.pointEmailThreshold" },
  umami: {
    scriptUrl: "umami.scriptUrl",
    websiteId: "umami.websiteId",
    apiUrl: "umami.apiUrl",
    apiUsername: "umami.apiUsername",
    apiPassword: "umami.apiPassword",
  },
};

const sensitiveFields = new Set(["password", "secretKey", "apiPassword"]);

function isSettingsGroup(group: string): group is keyof typeof groupSchemas {
  return group in groupSchemas;
}

export async function saveSettingsGroup(
  group: string,
  values: Record<string, unknown>,
  actor: { id: bigint },
): Promise<SaveSettingsResult> {
  if (!isSettingsGroup(group)) {
    return { ok: false, code: "VALIDATION_FAILED", message: `非法配置组:${group}` };
  }
  const parsed = groupSchemas[group].safeParse(values);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: `参数错误:${first?.path.join(".") || group}`,
    };
  }

  const keys = groupKeys[group];
  const fields = Object.keys(keys);
  const currentRows = await prisma.systemConfig.findMany({
    where: { key: { in: Object.values(keys) } },
    select: { key: true, value: true },
  });
  const current = Object.fromEntries(currentRows.map((r) => [r.key, r.value]));

  // 敏感字段空/缺省=保持原值;其余字段直接序列化
  const next: Record<string, string> = {};
  for (const field of fields) {
    const key = keys[field];
    if (key === undefined) continue;
    const raw = (parsed.data as Record<string, unknown>)[field];
    if (sensitiveFields.has(field) && (raw === undefined || raw === "")) {
      next[key] = current[key] ?? "";
    } else {
      next[key] = String(raw);
    }
  }

  // turnstile 组合校验(enabled=true 必须有双密钥,保持语义含原值)先行给出命名错误码
  if (group === "turnstile") {
    const siteKey = next["turnstile.siteKey"];
    const secretKey = next["turnstile.secretKey"];
    if (next["turnstile.enabled"] === "true" && (!siteKey || !secretKey)) {
      return {
        ok: false,
        code: "TURNSTILE_KEYS_REQUIRED",
        message: "enabled=true 时 siteKey/secretKey 必填",
      };
    }
  }

  // 候选行整表校验:失败零写入(configSchema 兜底,如未来新增跨组约束)
  const allRows = await prisma.systemConfig.findMany({
    select: { key: true, value: true },
  });
  const candidateMap = new Map(allRows.map((r) => [r.key, r.value]));
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined) {
      candidateMap.set(key, value);
    }
  }
  try {
    buildConfigFromRows([...candidateMap].map(([key, value]) => ({ key, value })));
  } catch (err) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: err instanceof Error ? err.message : "配置校验失败",
    };
  }

  // 只写有变化的键
  const changedKeys = Object.keys(next).filter((key) => {
    const value = next[key];
    return value !== undefined && (current[key] ?? "") !== value;
  });
  if (changedKeys.length > 0) {
    await prisma.$transaction(
      changedKeys.map((key) =>
        prisma.systemConfig.upsert({
          where: { key },
          create: { key, value: next[key] ?? "" },
          update: { value: next[key] ?? "" },
        }),
      ),
    );
    await reloadSystemConfig();
  }

  // 审计只落组名/键名/掩码标记,任何值不落(数据-model §5)
  const sensitiveKeys = changedKeys.filter((key) => {
    const field = Object.keys(keys).find((f) => keys[f] === key);
    return field !== undefined && sensitiveFields.has(field);
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.SETTINGS_CHANGED,
    actorUserId: actor.id,
    payload: {
      group,
      diff: Object.fromEntries(changedKeys.map((key) => [key, "(变更)"])),
      sensitive: sensitiveKeys,
    },
  });
  return { ok: true };
}

export type SendTestMailResult = { ok: true } | { ok: false; error: string };

/** 测试发信:直发不入 outbox;失败回显脱敏摘要(业务结果,不 5xx);两条路径都审计 */
export async function sendTestMail(
  to: string,
  actor: { id: bigint },
): Promise<SendTestMailResult> {
  const { smtp } = await getConfig();
  const transporter = await getTransporter();
  try {
    await transporter.sendMail({
      from: smtp.from,
      to,
      subject: "【老克塔】测试发信",
      text: "这是一封来自后台设置页的测试邮件,收到即说明 SMTP 通道配置有效。",
      html: "<p>这是一封来自后台设置页的测试邮件,收到即说明 SMTP 通道配置有效。</p>",
    });
    await writeAudit({
      category: AUDIT_CATEGORY.ADMIN,
      action: AUDIT_ACTION.SETTINGS_TEST_MAIL,
      actorUserId: actor.id,
      payload: { to, ok: true },
    });
    return { ok: true };
  } catch (err) {
    // 摘要:首行+截断,并按配置值脱敏(凭据零打印,宪法 VI)
    const raw = err instanceof Error ? err.message : String(err);
    const firstLine = raw.split("\n")[0] ?? raw;
    let summary = firstLine.slice(0, 200);
    if (smtp.password) {
      summary = summary.replaceAll(smtp.password, "***");
    }
    await writeAudit({
      category: AUDIT_CATEGORY.ADMIN,
      action: AUDIT_ACTION.SETTINGS_TEST_MAIL,
      actorUserId: actor.id,
      payload: { to, ok: false, error: summary },
    });
    return { ok: false, error: summary || "发送失败,请检查 SMTP 配置" };
  }
}
