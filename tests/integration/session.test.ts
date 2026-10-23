import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import {
  consumeRefreshToken,
  createSession,
  getSessionFromToken,
  issueRefreshToken,
  revokeAllRefreshTokens,
  revokeAllSessions,
  revokeSession,
} from "@/lib/auth/session";

/**
 * T016 会话机制集成测试(quickstart S2):
 * JWT+Redis 深校验、吊销即失效、refresh 单次轮换、重放→全吊销。
 * 只依赖 Redis(会话真相源),无需 DB 用户行。
 */
const uid = BigInt(Date.now() & 0x7fffffff); // 测试专用虚拟用户 id

beforeAll(async () => {
  await redis.ping(); // Redis 不可达时快速失败
});

afterAll(async () => {
  await revokeAllSessions(uid.toString());
  await revokeAllRefreshTokens(uid.toString());
  await redis.quit();
});

describe("US1 会话(research R4)", () => {
  it("createSession → 深校验通过 → revoke 后同一 token 失效", async () => {
    const { accessToken, payload } = await createSession(uid, "user");
    expect(payload.userId).toBe(uid.toString());

    const alive = await getSessionFromToken(accessToken);
    expect(alive).not.toBeNull();
    expect(alive?.jti).toBe(payload.jti);

    await revokeSession(uid.toString(), payload.jti);
    expect(await getSessionFromToken(accessToken)).toBeNull();
  });

  it("伪 JWT / 无 Redis 记录的 token 深校验拒绝", async () => {
    expect(await getSessionFromToken("not-a-jwt")).toBeNull();
    expect(await getSessionFromToken(undefined)).toBeNull();
  });

  it("refresh 单次轮换:消费成功→旧 token 再消费即重放→全吊销", async () => {
    const { accessToken } = await createSession(uid, "user");
    const { token } = await issueRefreshToken(uid);

    const rotated = await consumeRefreshToken(uid, token);
    expect(rotated).not.toBeNull();
    expect(rotated?.token).not.toBe(token); // 轮换出新 token

    // 重放旧 token:指纹已删 → 全吊销防御,返回 null
    const replay = await consumeRefreshToken(uid, token);
    expect(replay).toBeNull();

    // 全吊销后,原访问 token 也应失效(FR-014)
    expect(await getSessionFromToken(accessToken)).toBeNull();
  });

  it("指纹不符的 refresh 等同重放:触发全吊销", async () => {
    const { accessToken } = await createSession(uid, "user");
    const { token } = await issueRefreshToken(uid);
    const forged = `${token.split(".")[0]}.deadbeef`;

    expect(await consumeRefreshToken(uid, forged)).toBeNull();
    expect(await getSessionFromToken(accessToken)).toBeNull();
  });
});
