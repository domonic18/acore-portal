import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redis } from "@/lib/redis";
import {
  consumeRefreshToken,
  createSession,
  getSessionFromToken,
  issueRefreshToken,
  parseRefreshToken,
  revokeAllRefreshTokens,
  revokeAllSessions,
  revokeSession,
} from "@/lib/auth/session";
import { SESSION } from "@/constants/session";

/**
 * T016 会话机制集成测试(quickstart S2):
 * JWT+Redis 深校验、吊销即失效、refresh 单次轮换、并发重放幂等、重放→全吊销。
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

  it("refresh token 自带 userId:不依赖 access cookie 也能定位用户", async () => {
    const { token } = await issueRefreshToken(uid);
    const parts = parseRefreshToken(token);
    expect(parts?.userId).toBe(uid.toString());
    expect(parts?.id).toBeTruthy();
    expect(parts?.material).toBeTruthy();

    // 旧形态(缺 userId 段)不可解析 ⇒ 不是盗用证据,交给路由层正常落点
    expect(parseRefreshToken("abc.def")).toBeNull();
    expect(parseRefreshToken(undefined)).toBeNull();
  });

  it("refresh 单次轮换:消费成功 → 同一 token 并发重放在宽限期内幂等、不吊销", async () => {
    const { accessToken } = await createSession(uid, "user");
    const { token } = await issueRefreshToken(uid);

    const rotated = await consumeRefreshToken(uid, token);
    expect(rotated).not.toBeNull();
    expect(rotated?.token).not.toBe(token); // 轮换出新 token

    // 并发重放(多标签页同时续期):宽限期内返回同一个新 token,不判盗用
    const replay = await consumeRefreshToken(uid, token);
    expect(replay?.token).toBe(rotated?.token);
    // 会话不被吊销(否则一次并发就把用户踢下线)
    expect(await getSessionFromToken(accessToken)).not.toBeNull();
  });

  it("超出宽限期仍重放旧 token ⇒ 判盗用、全吊销", async () => {
    const { accessToken } = await createSession(uid, "user");
    const { token } = await issueRefreshToken(uid);
    const rotated = await consumeRefreshToken(uid, token);
    expect(rotated).not.toBeNull();

    // 宽限标记过期后,旧 token 再来 ⇒ 查无此键 ⇒ 盗用嫌疑 ⇒ 全吊销
    const parts = parseRefreshToken(token)!;
    await redis.del(`${SESSION.REFRESH_ROTATION_PREFIX}:${uid}:${parts.id}`);

    const replay = await consumeRefreshToken(uid, token);
    expect(replay).toBeNull();
    expect(await getSessionFromToken(accessToken)).toBeNull(); // FR-014
  });

  it("指纹不符的 refresh 等同重放:触发全吊销", async () => {
    const { accessToken } = await createSession(uid, "user");
    const { token } = await issueRefreshToken(uid);
    const parts = parseRefreshToken(token)!;
    const forged = `${parts.userId}.${parts.id}.deadbeef`;

    expect(await consumeRefreshToken(uid, forged)).toBeNull();
    expect(await getSessionFromToken(accessToken)).toBeNull();
  });

  it("形态不可解析的 refresh:拒但不吊销会话", async () => {
    const { accessToken } = await createSession(uid, "user");

    expect(await consumeRefreshToken(uid, "garbage")).toBeNull();
    expect(await getSessionFromToken(accessToken)).not.toBeNull();
  });
});
