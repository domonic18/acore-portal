import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { sha256Hex } from "@/lib/auth/game-hash";
import { SESSION } from "@/constants/session";

const secret = new TextEncoder().encode(env.SESSION_SECRET);

export type SessionRole = "user" | "moderator" | "admin";

export type SessionPayload = {
  userId: string;
  role: SessionRole;
  jti: string;
};

/**
 * 会话方案(research R4):JWT HttpOnly(短效 2h)仅是"声明",
 * 真相源是 Redis `session:{userId}:{jti}` —— 删除即吊销(改密全吊销,FR-014)。
 * middleware(edge 无 redis)只做 JWT 浅校验做路由守卫;RSC/API 层必须用本模块深校验。
 */
export async function createSession(
  userId: bigint,
  role: SessionRole,
): Promise<{ accessToken: string; payload: SessionPayload }> {
  const jti = crypto.randomUUID();
  const payload: SessionPayload = { userId: userId.toString(), role, jti };
  await redis.set(
    `${SESSION.REDIS_PREFIX}:${userId}:${jti}`,
    JSON.stringify({ createdAt: Date.now() }),
    "EX",
    SESSION.ACCESS_TTL_SECONDS,
  );
  const accessToken = await new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(`${SESSION.ACCESS_TTL_SECONDS}s`)
    .sign(secret);
  return { accessToken, payload };
}

/** 深校验:JWT 签名 + Redis 会话存在(吊销即失效)。API/RSC 一律走这里 */
export async function getSessionFromToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  let userId: string | undefined;
  let jti: string | undefined;
  let role: SessionRole = "user";
  try {
    const { payload } = await jwtVerify(token, secret);
    userId = payload.sub ?? undefined;
    jti = payload.jti ?? undefined;
    if (payload.role === "admin" || payload.role === "moderator") {
      role = payload.role;
    }
  } catch {
    return null;
  }
  if (!userId || !jti) return null;
  const exists = await redis.exists(`${SESSION.REDIS_PREFIX}:${userId}:${jti}`);
  if (!exists) return null; // 已吊销或过期
  return { userId, role, jti };
}

export async function revokeSession(userId: string, jti: string): Promise<void> {
  await redis.del(`${SESSION.REDIS_PREFIX}:${userId}:${jti}`);
}

/** 改密/重置后吊销该用户全部会话(FR-014) */
export async function revokeAllSessions(userId: string): Promise<number> {
  const pattern = `${SESSION.REDIS_PREFIX}:${userId}:*`;
  let cursor = "0";
  let removed = 0;
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) {
      await redis.del(...keys);
      removed += keys.length;
    }
  } while (cursor !== "0");
  return removed;
}

// ===== remember 登录:30 天 refresh token,单次有效、使用即轮换(research R4) =====

/**
 * refresh token 形态 `{userId}.{id}.{material}`:
 * 自带 userId ⇒ 续期不依赖 access cookie(access cookie 2h 到期即被浏览器删除,
 * 靠 access cookie 的 sub 定位用户会让续期链路在 2h 后必断)。
 * material 是随机密钥,Redis 只存其 sha256 指纹。
 */
export type RefreshTokenParts = { userId: string; id: string; material: string };

export function parseRefreshToken(
  presented: string | null | undefined,
): RefreshTokenParts | null {
  if (!presented) return null;
  const parts = presented.split(".");
  if (parts.length !== 3) return null;
  const [userId, id, material] = parts;
  if (!userId || !id || !material) return null;
  if (!/^\d+$/.test(userId)) return null;
  return { userId, id, material };
}

export async function issueRefreshToken(
  userId: bigint,
): Promise<{ token: string }> {
  const id = crypto.randomUUID();
  const secretMaterial = crypto.randomBytes(32).toString("base64url");
  await redis.set(
    `${SESSION.REFRESH_REDIS_PREFIX}:${userId}:${id}`,
    sha256Hex(secretMaterial),
    "EX",
    SESSION.REFRESH_TTL_SECONDS,
  );
  return { token: `${userId}.${id}.${secretMaterial}` };
}

/**
 * 原子「消费或并发重放」(Lua 保证读-改-写不可分割):
 * ① 指纹相符 ⇒ 轮换:新 token 落新键、旧键删、旧→新映射写宽限标记;
 * ② 指纹不符但命中宽限标记里的旧指纹 ⇒ 并发重放(多标签页同时续期),
 *    幂等返回同一个新 token,不判盗用、不吊销;
 * ③ 其余(查无此 token / 指纹不符)⇒ 盗用嫌疑,由调用方全吊销。
 */
const ROTATE_REFRESH_LUA = `
local cur = redis.call('GET', KEYS[1])
if cur and cur == ARGV[1] then
  redis.call('SET', KEYS[3], ARGV[2], 'EX', ARGV[4])
  redis.call('SET', KEYS[2], ARGV[1] .. '|' .. ARGV[3], 'EX', ARGV[5])
  redis.call('DEL', KEYS[1])
  return ARGV[3]
end
local marker = redis.call('GET', KEYS[2])
if marker then
  local sep = string.find(marker, '|')
  if sep and string.sub(marker, 1, sep - 1) == ARGV[1] then
    return string.sub(marker, sep + 1)
  end
end
return nil
`;

/**
 * 消费 refresh token:验证 → 轮换出新 token(单次有效)。
 * 查无此 token 或指纹不符 = 过期或重放 → 全吊销该用户会话(research R4 防盗用)。
 * 形态不可解析(旧版/损坏)不是盗用证据,直接拒、不吊销。
 */
export async function consumeRefreshToken(
  userId: bigint,
  presented: string,
): Promise<{ token: string } | null> {
  const parts = parseRefreshToken(presented);
  if (!parts || parts.userId !== userId.toString()) return null;

  const newId = crypto.randomUUID();
  const newMaterial = crypto.randomBytes(32).toString("base64url");
  const newToken = `${userId}.${newId}.${newMaterial}`;
  const result = await redis.eval(
    ROTATE_REFRESH_LUA,
    3,
    `${SESSION.REFRESH_REDIS_PREFIX}:${userId}:${parts.id}`,
    `${SESSION.REFRESH_ROTATION_PREFIX}:${userId}:${parts.id}`,
    `${SESSION.REFRESH_REDIS_PREFIX}:${userId}:${newId}`,
    sha256Hex(parts.material),
    sha256Hex(newMaterial),
    newToken,
    String(SESSION.REFRESH_TTL_SECONDS),
    String(SESSION.REFRESH_ROTATION_GRACE_SECONDS),
  );
  if (typeof result !== "string" || result.length === 0) {
    await revokeAllSessions(userId.toString());
    return null;
  }
  return { token: result };
}

/** 主动退出:仅吊销当前设备的 refresh token(单次有效,使用即轮换) */
export async function revokeRefreshToken(
  presented: string | undefined,
): Promise<void> {
  const parts = parseRefreshToken(presented);
  if (!parts) return;
  await redis.del(
    `${SESSION.REFRESH_REDIS_PREFIX}:${parts.userId}:${parts.id}`,
  );
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await scanDel(`${SESSION.REFRESH_REDIS_PREFIX}:${userId}:*`);
  await scanDel(`${SESSION.REFRESH_ROTATION_PREFIX}:${userId}:*`);
}

/** 按模式批量删键(SCAN 分批,禁 KEYS 全量扫) */
async function scanDel(pattern: string): Promise<void> {
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}
