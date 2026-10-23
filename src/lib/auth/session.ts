import "server-only";
import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";
import { sha256Hex } from "@/lib/auth/game-hash";
import { SESSION } from "@/constants/session";

const secret = new TextEncoder().encode(env.SESSION_SECRET);

export type SessionRole = "user" | "admin";

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
    if (payload.role === "admin") role = "admin";
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
  return { token: `${id}.${secretMaterial}` };
}

/**
 * 消费 refresh token:验证 → 删旧(单次有效)→ 签发新(轮换)。
 * 不存在或指纹不符 = 过期或重放 → 全吊销该用户会话(research R4 防盗用)。
 */
export async function consumeRefreshToken(
  userId: bigint,
  presented: string,
): Promise<{ token: string } | null> {
  const dot = presented.indexOf(".");
  if (dot <= 0) return null;
  const id = presented.slice(0, dot);
  const material = presented.slice(dot + 1);
  const key = `${SESSION.REFRESH_REDIS_PREFIX}:${userId}:${id}`;
  const stored = await redis.get(key);
  if (!stored || stored !== sha256Hex(material)) {
    await revokeAllSessions(userId.toString());
    return null;
  }
  await redis.del(key);
  return { token: (await issueRefreshToken(userId)).token };
}

export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  const pattern = `${SESSION.REFRESH_REDIS_PREFIX}:${userId}:*`;
  let cursor = "0";
  do {
    const [next, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = next;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
}
