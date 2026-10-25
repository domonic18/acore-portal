import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { authDb } from "@/lib/db/auth";
import { redis } from "@/lib/redis";
import { checkLock, clearKeys, setLock } from "@/lib/redis/rate-limit";
import { reloadSystemConfig } from "@/lib/config";
import { AUDIT_ACTION } from "@/constants/audit";
import { PASSWORD_ALGO } from "@/constants/password";
import { hashWpBcrypt } from "@/lib/auth/wp-bcrypt";
import {
  loginFailIpKey,
  loginFailKey,
  loginLockKey,
} from "@/server/services/auth/login-guard";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as registerPost } from "@/app/api/auth/register/route";

/**
 * M4 US2 登录防滥用集成(T009/T010/T011):
 * Turnstile 关态直通/开态 422 且不计失败;连错达阈 429 RATE_LIMITED+锁;
 * 锁期内前置拦截 429 LOGIN_LOCKED;窗口/锁自然过期恢复;
 * 不存在用户名同计数同锁且 401/429 文案与真实用户逐字一致(FR-307);
 * 成功清账;审计 LOGIN_LOCKED 无凭据字段(宪法 VI)。
 * 状态注入:失败计数/锁直接写 Redis(键格式契约同 guard 导出),
 * Turnstile 开关走 system_config 行+reloadSystemConfig,siteverify 用 stub fetch。
 */
const RUN = Date.now().toString(36);
const PASSWORD = "GuardPass123";
const MAX_FAILS = 5; // 默认 security.loginMaxFails(测试库无 security 行)
const TS_KEYS = ["turnstile.enabled", "turnstile.siteKey", "turnstile.secretKey"];
const GHOST = `t_${RUN}_au_ghost`;
const createdUsers: string[] = [];
const redisKeys: string[] = [];

// IP 段掺 RUN:IP 维计数键持久跨运行,固定 TEST-NET IP 会被自身历史失败锁定
const ip = (n: number) => `203.0.${parseInt(RUN, 36) % 254}.${n}`;

async function makeUser(suffix: number, password: string) {
  const username = `t_${RUN}_au_${suffix}`;
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: hashWpBcrypt(password),
      passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
    },
    select: { id: true, username: true },
  });
  redisKeys.push(loginFailKey(username), loginLockKey(username));
  createdUsers.push(username);
  return { ...user, password };
}

function loginReq(body: unknown, ipAddr?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ipAddr) headers["x-forwarded-for"] = ipAddr;
  return new NextRequest("http://localhost/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

const login = (body: unknown, ipAddr?: string) =>
  loginPost(loginReq(body, ipAddr));

const errBody = async (res: Response) =>
  (await res.json()) as {
    error: { code: string; message: string; retryAfterSec?: number };
  };

async function seedFails(username: string, count: number, ttl = 900) {
  await redis.set(loginFailKey(username), String(count), "EX", ttl);
}

async function enableTurnstile() {
  await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
  await prisma.systemConfig.createMany({
    data: [
      { key: "turnstile.enabled", value: "true" },
      { key: "turnstile.siteKey", value: "site-test" },
      { key: "turnstile.secretKey", value: "sec-test" },
    ],
  });
  await reloadSystemConfig();
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  // 关态基线:turnstile 行持久跨文件,先清(组内开态测试结束也会还原)
  await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
  await reloadSystemConfig();
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
  await reloadSystemConfig();
  for (const username of createdUsers) {
    await prisma.user.deleteMany({ where: { username } });
  }
  await clearKeys(redisKeys);
  vi.unstubAllGlobals();
  await prisma.$disconnect();
  await redis.quit();
});

describe("M4 US2 登录防滥用——Turnstile 关态(T009)", () => {
  it("关态直通:不发起 siteverify,错误密码 401 且计一次失败", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { username } = await makeUser(0, PASSWORD);
    const res = await login({ username, password: "wrong-pass" }, ip(10));
    expect(res.status).toBe(401);
    expect((await errBody(res)).error.code).toBe("INVALID_CREDENTIALS");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await redis.get(loginFailKey(username))).toBe("1");
    vi.unstubAllGlobals();
  });

  it("登录成功清账:失败计数(用户名/IP)与锁全清", async () => {
    const { username, password } = await makeUser(1, PASSWORD);
    const i = ip(11);
    redisKeys.push(loginFailIpKey(i));
    await seedFails(username, 3);
    const res = await login({ username, password }, i);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { username: string } }).user.username).toBe(
      username,
    );
    expect(await redis.get(loginFailKey(username))).toBeNull();
    expect(await redis.get(loginFailIpKey(i))).toBeNull();
    expect((await checkLock(loginLockKey(username))).locked).toBe(false);
  });

  it("连错达阈值:第 6 次 429 RATE_LIMITED+锁键存在+审计落行;锁期内 429 LOGIN_LOCKED 且不碰凭据", async () => {
    const { username, password } = await makeUser(2, PASSWORD);
    const i = ip(12);
    redisKeys.push(loginFailIpKey(i));
    await seedFails(username, MAX_FAILS);

    const six = await login({ username, password: "wrong" }, i);
    expect(six.status).toBe(429);
    const sixBody = await errBody(six);
    expect(sixBody.error.code).toBe("RATE_LIMITED");
    expect(sixBody.error.retryAfterSec).toBeGreaterThan(0);
    expect((await checkLock(loginLockKey(username))).locked).toBe(true);

    // 审计:LOGIN_LOCKED 落行,含 username/ip/计数,无任何凭据字段(宪法 VI)
    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTION.LOGIN_LOCKED },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
    const payload = (audit?.payloadJson ?? {}) as Record<string, unknown>;
    expect(payload.username).toBe(username);
    expect(payload.ip).toBe(i);
    expect(Object.keys(payload)).not.toContain("password");

    // 锁期内:错密码与正确密码都走前置锁拦截,不触达凭据校验
    const again = await login({ username, password: "wrong" }, i);
    expect(again.status).toBe(429);
    expect((await errBody(again)).error.code).toBe("LOGIN_LOCKED");
    const withRight = await login({ username, password }, i);
    expect(withRight.status).toBe(429);
    const wb = await errBody(withRight);
    expect(wb.error.code).toBe("LOGIN_LOCKED");
    expect(wb.error.retryAfterSec).toBeGreaterThan(0);
  });

  it("窗口过期与锁到期自然恢复:恢复 401 正常计数", async () => {
    const { username } = await makeUser(4, PASSWORD);
    const i = ip(14);
    // 计数窗口过期 → 计数重起(401,非 429)
    await seedFails(username, MAX_FAILS, 1);
    await new Promise((r) => setTimeout(r, 1200));
    const res = await login({ username, password: "wrong" }, i);
    expect(res.status).toBe(401);
    expect(await redis.get(loginFailKey(username))).toBe("1");

    // 锁到期 → 不再 LOGIN_LOCKED
    await clearKeys([loginFailKey(username), loginFailIpKey(i)]);
    await setLock(loginLockKey(username), 1);
    await new Promise((r) => setTimeout(r, 1200));
    const res2 = await login({ username, password: "wrong" }, i);
    expect(res2.status).toBe(401);
    expect((await errBody(res2)).error.code).toBe("INVALID_CREDENTIALS");
  });

  it("不存在用户名:同计数同锁;401/429 文案与真实用户逐字一致(FR-307)", async () => {
    const { username: real, password } = await makeUser(3, PASSWORD);
    const ipR = ip(30);
    const ipG = ip(31);
    redisKeys.push(loginFailIpKey(ipG), loginFailKey(GHOST), loginLockKey(GHOST));

    const real401 = await errBody(
      await login({ username: real, password: "wrong" }, ipR),
    );
    const ghost401 = await errBody(
      await login({ username: GHOST, password: "wrong" }, ipG),
    );
    expect(await redis.get(loginFailKey(GHOST))).toBe("1");
    expect(ghost401.error.message).toBe(real401.error.message);

    await clearKeys([loginFailKey(real), loginFailIpKey(ipR)]);
    // 双方各连错达阈 → RATE_LIMITED 文案逐字一致
    await seedFails(GHOST, MAX_FAILS);
    await seedFails(real, MAX_FAILS);
    const ghost429 = await errBody(
      await login({ username: GHOST, password: "wrong" }, ipG),
    );
    const real429 = await errBody(
      await login({ username: real, password: "wrong" }, ipR),
    );
    expect(ghost429.error.code).toBe("RATE_LIMITED");
    expect(real429.error.code).toBe("RATE_LIMITED");
    expect(real429.error.message).toBe(ghost429.error.message);
    expect((await checkLock(loginLockKey(GHOST))).locked).toBe(true);

    // 锁期内 → LOGIN_LOCKED 文案逐字一致(真实用户用正确密码仍被拦)
    const ghostLock = await errBody(
      await login({ username: GHOST, password: "wrong" }, ipG),
    );
    const realLock = await errBody(await login({ username: real, password }, ipR));
    expect(ghostLock.error.code).toBe("LOGIN_LOCKED");
    expect(realLock.error.code).toBe("LOGIN_LOCKED");
    expect(realLock.error.message).toBe(ghostLock.error.message);
    expect(ghostLock.error.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("M4 US2 登录防滥用——Turnstile 开态(T009/T011)", () => {
  it("开+无 token → 422 TURNSTILE_FAILED:不出网、不计失败", async () => {
    await enableTurnstile();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { username } = await makeUser(5, PASSWORD);
    const res = await login({ username, password: "wrong" }, ip(15));
    expect(res.status).toBe(422);
    expect((await errBody(res)).error.code).toBe("TURNSTILE_FAILED");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await redis.get(loginFailKey(username))).toBeNull();
    vi.unstubAllGlobals();
  });

  it("开+siteverify 恒失败 → 422 不计失败;通过 → 进入凭据校验并计数", async () => {
    const { username, password } = await makeUser(6, PASSWORD);
    const i = ip(16);
    redisKeys.push(loginFailIpKey(i));
    let pass = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ success: pass }), { status: 200 }),
      ),
    );

    const blocked = await login(
      { username, password: "wrong", turnstileToken: "tok" },
      i,
    );
    expect(blocked.status).toBe(422);
    expect(await redis.get(loginFailKey(username))).toBeNull();

    pass = true;
    const allowed = await login(
      { username, password: "wrong", turnstileToken: "tok" },
      i,
    );
    expect(allowed.status).toBe(401);
    expect(await redis.get(loginFailKey(username))).toBe("1");
    vi.unstubAllGlobals();
  });

  it("注册路由:开+无 token → 422 且零副作用(不建站点/游戏账号)", async () => {
    await enableTurnstile();
    const username = `t_${RUN}_au_reg`;
    const req = new NextRequest("http://localhost/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email: `${username}@test.local` }),
      headers: { "content-type": "application/json" },
    });
    const res = await registerPost(req);
    expect(res.status).toBe(422);
    expect((await errBody(res)).error.code).toBe("TURNSTILE_FAILED");
    expect(await prisma.user.count({ where: { email: `${username}@test.local` } })).toBe(0);
    expect(await authDb.findByUsername(username)).toBeNull();
  });
});
