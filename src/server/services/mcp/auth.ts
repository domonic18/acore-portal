import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getConfig, reloadSystemConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  MCP_CONFIG_KEYS,
  MCP_DEFAULT_TOKEN_TTL_DAYS,
  MCP_SCOPE,
  MCP_TOKEN_PLAIN_PREFIX,
  type McpScopeValue,
  type McpTokenView,
} from "@/constants/mcp";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * MCP 长期访问令牌(二期 M6;规格 §17.3)
 *
 * 口径:
 * - **只写不读**:库中仅存 SHA-256 哈希,明文只在签发响应里出现一次;
 * - **签发即覆盖**:同一组 mcp.* 键 ⇒ 同时只有一枚活跃令牌(轮换 = 签发新令牌);
 * - 吊销 = 清空哈希;
 * - 令牌状态键**不进设置页**(设置页整组全量提交会覆盖组内所有键 ⇒ 会把令牌冲掉),
 *   故令牌与限额均由此域直写 system_config + reloadSystemConfig() 热生效。
 */

export type McpIssueInput = {
  scope: McpScopeValue;
  /** 有效天数(默认 90);签发即覆盖旧令牌 */
  ttlDays?: number;
  /** 绑定的管理员身份(审计 actor) */
  adminUserId?: bigint | null;
};

export type McpIssueResult = {
  /** 令牌明文——只在此处出现一次,调用方须立即回传给签发者 */
  plain: string;
  expiresAt: string;
  tokenPrefix: string;
};

function parseScope(value: string): McpScopeValue | null {
  return value === MCP_SCOPE.READ || value === MCP_SCOPE.WRITE ? value : null;
}

function clampTtlDays(ttlDays: number | undefined): number {
  if (ttlDays === undefined || !Number.isFinite(ttlDays)) return MCP_DEFAULT_TOKEN_TTL_DAYS;
  return Math.min(365, Math.max(1, Math.floor(ttlDays)));
}

async function writeConfigKeys(values: Record<string, string>): Promise<void> {
  await prisma.$transaction(
    Object.entries(values).map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );
  await reloadSystemConfig();
}

/** 后台视图:只回「已配置」布尔 + 前缀 + 作用域 + 有效期 + 签发时刻,永不含哈希/明文 */
export async function readMcpTokenView(): Promise<McpTokenView> {
  const mcp = (await getConfig()).mcp;
  return {
    configured: mcp.tokenHash.length > 0,
    tokenPrefix: mcp.tokenPrefix,
    scope: parseScope(mcp.tokenScope),
    expiresAt: mcp.tokenExpiresAt || null,
    issuedAt: mcp.tokenIssuedAt || null,
    adminUserId: mcp.tokenAdminUserId || null,
    qpsLimit: mcp.qpsLimit,
    dailyLimit: mcp.dailyLimit,
    ipMaxPerMin: mcp.ipMaxPerMin,
  };
}

/** 签发新令牌(= 轮换):明文只在返回值里出现一次 */
export async function issueMcpToken(input: McpIssueInput): Promise<McpIssueResult> {
  const ttlDays = clampTtlDays(input.ttlDays);
  const plain = `${MCP_TOKEN_PLAIN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  const tokenPrefix = plain.slice(0, MCP_TOKEN_PLAIN_PREFIX.length + 6);
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + ttlDays * 24 * 3600 * 1000).toISOString();

  await writeConfigKeys({
    [MCP_CONFIG_KEYS.tokenHash]: sha256Hex(plain),
    [MCP_CONFIG_KEYS.tokenPrefix]: tokenPrefix,
    [MCP_CONFIG_KEYS.tokenScope]: input.scope,
    [MCP_CONFIG_KEYS.tokenExpiresAt]: expiresAt,
    [MCP_CONFIG_KEYS.tokenIssuedAt]: issuedAt.toISOString(),
    [MCP_CONFIG_KEYS.tokenAdminUserId]: input.adminUserId?.toString() ?? "",
  });

  // 审计只记作用域与有效期,不记明文/哈希
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_ISSUED,
    actorUserId: input.adminUserId ?? null,
    payload: { scope: input.scope, ttlDays, expiresAt },
  });

  return { plain, expiresAt, tokenPrefix };
}

/** 吊销:清空哈希(旧令牌即时失效) */
export async function revokeMcpToken(actorUserId?: bigint | null): Promise<void> {
  const before = await readMcpTokenView();
  await writeConfigKeys({
    [MCP_CONFIG_KEYS.tokenHash]: "",
    [MCP_CONFIG_KEYS.tokenPrefix]: "",
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_REVOKED,
    actorUserId: actorUserId ?? null,
    payload: { hadToken: before.configured, scope: before.scope },
  });
}

/** 限额调整:只落键名,不落值 */
export async function updateMcpLimits(
  limits: { qpsLimit?: number; dailyLimit?: number; ipMaxPerMin?: number },
  actorUserId?: bigint | null,
): Promise<McpTokenView> {
  const values: Record<string, string> = {};
  if (limits.qpsLimit !== undefined) {
    values[MCP_CONFIG_KEYS.qpsLimit] = String(limits.qpsLimit);
  }
  if (limits.dailyLimit !== undefined) {
    values[MCP_CONFIG_KEYS.dailyLimit] = String(limits.dailyLimit);
  }
  if (limits.ipMaxPerMin !== undefined) {
    values[MCP_CONFIG_KEYS.ipMaxPerMin] = String(limits.ipMaxPerMin);
  }
  if (Object.keys(values).length > 0) {
    await writeConfigKeys(values);
  }
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_LIMITS_CHANGED,
    actorUserId: actorUserId ?? null,
    payload: { keys: Object.values(MCP_CONFIG_KEYS).filter((k) => k in values) },
  });
  return readMcpTokenView();
}

export type McpTokenCheck =
  | { ok: true; scope: McpScopeValue; tokenId: string; adminUserId: bigint | null }
  | { ok: false; reason: "not_configured" | "invalid" | "expired" };

/** 恒定时间比对两个十六进制摘要(长度一致) */
function hashEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 校验令牌。
 * 失败一律 401 且**文案统一**(「令牌无效或已过期」),不区分「未配置/不匹配/已过期」
 * 以免被探测。
 */
export async function verifyMcpToken(plain: string | null | undefined): Promise<McpTokenCheck> {
  if (!plain) return { ok: false, reason: "invalid" };
  const mcp = (await getConfig()).mcp;
  if (!mcp.tokenHash) return { ok: false, reason: "not_configured" };

  const scope = parseScope(mcp.tokenScope);
  if (!scope) return { ok: false, reason: "invalid" };

  if (mcp.tokenExpiresAt) {
    const expires = new Date(mcp.tokenExpiresAt);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      return { ok: false, reason: "expired" };
    }
  }

  if (!hashEquals(sha256Hex(plain), mcp.tokenHash)) {
    return { ok: false, reason: "invalid" };
  }

  // tokenId = 哈希前 12 位:只是限速键的稳定指纹,不是机密
  let adminUserId: bigint | null = null;
  if (mcp.tokenAdminUserId) {
    try {
      adminUserId = BigInt(mcp.tokenAdminUserId);
    } catch {
      adminUserId = null;
    }
  }
  return { ok: true, scope, tokenId: mcp.tokenHash.slice(0, 12), adminUserId };
}
