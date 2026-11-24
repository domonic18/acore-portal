import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db";
import { getConfig, reloadSystemConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  MCP_CONFIG_KEYS,
  MCP_SCOPE,
  MCP_TOKEN_PLAIN_PREFIX,
  maskMcpToken,
  type McpScopeValue,
  type McpTokenView,
} from "@/constants/mcp";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * MCP 长期访问令牌(二期 M6;规格 §17.3)
 *
 * MiniMax 式令牌(2026-11-19 用户反馈):
 * - **默认已有一枚**:首次进入接入页即自动签发,不必手动签发;
 * - **掩码显示、随时复制**:明文落 system_config(与 SMTP/COS 密钥同库同权限,
 *   仅管理员会话可读),复制走单独动作并留审计;
 * - **随时轮换**:轮换即覆盖旧令牌,旧令牌即时失效;
 * - **无有效期**:不设 TTL,靠轮换与作用域开关控风险。
 *
 * 令牌状态键**不进设置页**(设置页整组全量提交会覆盖组内所有键 ⇒ 会把令牌冲掉),
 * 故令牌与限额均由此域直写 system_config + reloadSystemConfig() 热生效。
 */

export type McpScopeInput = McpScopeValue;

function parseScope(value: string): McpScopeValue | null {
  return value === MCP_SCOPE.READ || value === MCP_SCOPE.WRITE ? value : null;
}

/** 生成一枚新令牌明文 */
export function generateMcpTokenPlain(): string {
  return `${MCP_TOKEN_PLAIN_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
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

/** 后台视图:掩码串 + 作用域 + 签发时刻 + 限额,永不含明文 */
export async function readMcpTokenView(): Promise<McpTokenView> {
  const mcp = (await getConfig()).mcp;
  return {
    configured: mcp.token.length > 0,
    maskedToken: maskMcpToken(mcp.token),
    scope: parseScope(mcp.tokenScope),
    issuedAt: mcp.tokenIssuedAt || null,
    adminUserId: mcp.tokenAdminUserId || null,
    qpsLimit: mcp.qpsLimit,
    dailyLimit: mcp.dailyLimit,
    ipMaxPerMin: mcp.ipMaxPerMin,
  };
}

/**
 * 默认签发:库里没有令牌时补一枚(首次进入接入页即生效)。
 * 已有令牌则原样返回,不覆盖;**但绑定为空时回填**——早期自动补发没传
 * 管理员身份,令牌存在而 tokenAdminUserId 为空 ⇒ 论坛写工具(实名 actor)
 * 全被拒,回填即自愈,免轮换、客户端配置不用动。
 */
export async function ensureMcpToken(
  actorUserId?: bigint | null,
): Promise<{ plain: string; created: boolean }> {
  const mcp = (await getConfig()).mcp;
  if (mcp.token) {
    if (!mcp.tokenAdminUserId && actorUserId != null) {
      await writeConfigKeys({
        [MCP_CONFIG_KEYS.tokenAdminUserId]: actorUserId.toString(),
      });
      await writeAudit({
        category: AUDIT_CATEGORY.ADMIN,
        action: AUDIT_ACTION.MCP_TOKEN_BOUND,
        actorUserId,
        payload: { reason: "bind-backfill" },
      });
    }
    return { plain: mcp.token, created: false };
  }

  const plain = generateMcpTokenPlain();
  await writeConfigKeys({
    [MCP_CONFIG_KEYS.token]: plain,
    [MCP_CONFIG_KEYS.tokenScope]: MCP_SCOPE.WRITE,
    [MCP_CONFIG_KEYS.tokenIssuedAt]: new Date().toISOString(),
    [MCP_CONFIG_KEYS.tokenAdminUserId]: actorUserId?.toString() ?? "",
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_ISSUED,
    actorUserId: actorUserId ?? null,
    payload: { scope: MCP_SCOPE.WRITE, reason: "provision" },
  });
  return { plain, created: true };
}

/** 轮换令牌:新令牌覆盖旧令牌(旧令牌即时失效) */
export async function rotateMcpToken(
  actorUserId?: bigint | null,
  scope?: McpScopeInput,
): Promise<McpTokenView> {
  const current = (await getConfig()).mcp;
  const nextScope = scope ?? parseScope(current.tokenScope) ?? MCP_SCOPE.WRITE;
  const plain = generateMcpTokenPlain();

  await writeConfigKeys({
    [MCP_CONFIG_KEYS.token]: plain,
    [MCP_CONFIG_KEYS.tokenScope]: nextScope,
    [MCP_CONFIG_KEYS.tokenIssuedAt]: new Date().toISOString(),
    [MCP_CONFIG_KEYS.tokenAdminUserId]: actorUserId?.toString() ?? "",
  });

  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_ISSUED,
    actorUserId: actorUserId ?? null,
    payload: { scope: nextScope, reason: "rotate" },
  });
  return readMcpTokenView();
}

/**
 * 取回令牌明文(后台「复制令牌」用)。
 * 明文出库即留审计——谁在什么时候把密钥拷走了必须可追。
 */
export async function revealMcpToken(actorUserId?: bigint | null): Promise<string> {
  const { plain } = await ensureMcpToken(actorUserId);
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_COPIED,
    actorUserId: actorUserId ?? null,
    payload: { tokenPrefix: plain.slice(0, MCP_TOKEN_PLAIN_PREFIX.length + 6) },
  });
  return plain;
}

/** 作用域切换:即时生效,无需轮换 */
export async function updateMcpTokenScope(
  scope: McpScopeInput,
  actorUserId?: bigint | null,
): Promise<McpTokenView> {
  const before = parseScope((await getConfig()).mcp.tokenScope);
  await writeConfigKeys({ [MCP_CONFIG_KEYS.tokenScope]: scope });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.MCP_TOKEN_SCOPE_CHANGED,
    actorUserId: actorUserId ?? null,
    payload: { from: before, to: scope },
  });
  return readMcpTokenView();
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
  | { ok: false; reason: "not_configured" | "invalid" };

/** 恒定时间比对两个等长字符串 */
function plainEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * 校验令牌。
 * 失败一律 401 且**文案统一**(「令牌无效或已过期」),不区分「未配置/不匹配」
 * 以免被探测。令牌无有效期,故无过期分支。
 */
export async function verifyMcpToken(plain: string | null | undefined): Promise<McpTokenCheck> {
  if (!plain) return { ok: false, reason: "invalid" };
  const mcp = (await getConfig()).mcp;
  if (!mcp.token) return { ok: false, reason: "not_configured" };

  const scope = parseScope(mcp.tokenScope);
  if (!scope) return { ok: false, reason: "invalid" };

  if (!plainEquals(plain, mcp.token)) return { ok: false, reason: "invalid" };

  // tokenId = 令牌的哈希指纹:只是限速键的稳定标识,不是机密
  let adminUserId: bigint | null = null;
  if (mcp.tokenAdminUserId) {
    try {
      adminUserId = BigInt(mcp.tokenAdminUserId);
    } catch {
      adminUserId = null;
    }
  }
  return { ok: true, scope, tokenId: sha256Hex(plain).slice(0, 12), adminUserId };
}
