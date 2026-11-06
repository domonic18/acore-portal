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
  loginGlobalKey,
  loginIpLockKey,
  loginLockKey,
  loginSoftLockKey,
} from "@/constants/security";
import { auditIpSuspiciousKey, auditUnknownUserKey } from "@/server/services/auth/login-guard";
import { acquireHashSlot } from "@/server/services/auth/hash-semaphore";
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
const MAX_FAILS = 5;
const TS_KEYS = ["turnstile.enabled", "turnstile.siteKey", "turnstile.secretKey"];
/**
 * 本文件断言的阈值全部**显式钉住**,不依赖库里现值——
 * 开发库会被 E2E 预置/运维调参改动(如 loginIpMaxFails 被放宽到 5000),
 * 那样断言会静默失真。用完原样还原。
 */
const PINNED_SECURITY: Record<string, string> = {
  "security.loginMaxFails": String(MAX_FAILS),
  "security.loginWindowSec": "900",
  "security.loginLockSec": "900",
  "security.trustedProxyHops": "1",
  "security.loginIpSoftFails": "20",
  "security.loginIpMaxFails": "50",
  "security.loginIpLockSec": "900",
  "security.loginSoftLockSec": "2",
  // 本文件登录路由调用数超默认 60 次/分,测试期放宽
  "security.loginGlobalMaxPerMin": "100000",
};
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
      passwordHash: await hashWpBcrypt(password),
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

const login = (body: unknown, ipAddr?: string) => loginPost(loginReq(body, ipAddr));

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

let securityBackup: { key: string; value: string }[] = [];

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  // 关态基线:turnstile 行持久跨文件,先清(组内开态测试结束也会还原)
  await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
  // 阈值钉住:先快照,再强制写入本文件断言所依赖的值
  securityBackup = await prisma.systemConfig.findMany({
    where: { key: { in: Object.keys(PINNED_SECURITY) } },
    select: { key: true, value: true },
  });
  for (const [key, value] of Object.entries(PINNED_SECURITY)) {
    await prisma.systemConfig.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  await redis.del(loginGlobalKey());
  await reloadSystemConfig();
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
  // 还原阈值:原缺失的键删除(回落代码默认值),原存在的键写回
  await prisma.systemConfig.deleteMany({
    where: { key: { in: Object.keys(PINNED_SECURITY) } },
  });
  if (securityBackup.length > 0) {
    await prisma.systemConfig.createMany({ data: securityBackup });
  }
  await reloadSystemConfig();
  for (const username of createdUsers) {
    await prisma.user.deleteMany({ where: { username } });
  }
  await clearKeys([...redisKeys, loginGlobalKey()]);
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

  it("登录成功清账:用户名维计数与锁全清;IP 维计数保留(防交替洗白)", async () => {
    const { username, password } = await makeUser(1, PASSWORD);
    const i = ip(11);
    redisKeys.push(loginFailIpKey(i));
    await seedFails(username, 3);
    await redis.set(loginFailIpKey(i), "3", "EX", 900);
    const res = await login({ username, password }, i);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { user: { username: string } }).user.username).toBe(username);
    expect(await redis.get(loginFailKey(username))).toBeNull();
    // IP 维是攻击源画像:一次成功不洗白——否则「失败刷号 + 成功清零」可绕过 IP 锁
    expect(await redis.get(loginFailIpKey(i))).toBe("3");
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

    const real401 = await errBody(await login({ username: real, password: "wrong" }, ipR));
    const ghost401 = await errBody(await login({ username: GHOST, password: "wrong" }, ipG));
    expect(await redis.get(loginFailKey(GHOST))).toBe("1");
    expect(ghost401.error.message).toBe(real401.error.message);

    await clearKeys([loginFailKey(real), loginFailIpKey(ipR)]);
    // 双方各连错达阈 → RATE_LIMITED 文案逐字一致
    await seedFails(GHOST, MAX_FAILS);
    await seedFails(real, MAX_FAILS);
    const ghost429 = await errBody(await login({ username: GHOST, password: "wrong" }, ipG));
    const real429 = await errBody(await login({ username: real, password: "wrong" }, ipR));
    expect(ghost429.error.code).toBe("RATE_LIMITED");
    expect(real429.error.code).toBe("RATE_LIMITED");
    expect(real429.error.message).toBe(ghost429.error.message);
    expect((await checkLock(loginLockKey(GHOST))).locked).toBe(true);

    // 锁期内 → LOGIN_LOCKED 文案逐字一致(真实用户用正确密码仍被拦)
    const ghostLock = await errBody(await login({ username: GHOST, password: "wrong" }, ipG));
    const realLock = await errBody(await login({ username: real, password }, ipR));
    expect(ghostLock.error.code).toBe("LOGIN_LOCKED");
    expect(realLock.error.code).toBe("LOGIN_LOCKED");
    expect(realLock.error.message).toBe(ghostLock.error.message);
    expect(ghostLock.error.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("2026-11-06 撞库加固——审计补齐(PR-0)", () => {
  it("登录成功 → LOGIN_SUCCESS 审计行,ip 落顶层列", async () => {
    const { username, password } = await makeUser(20, PASSWORD);
    const i = ip(40);
    redisKeys.push(loginFailIpKey(i));
    const res = await login({ username, password }, i);
    expect(res.status).toBe(200);

    const rows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.LOGIN_SUCCESS },
      orderBy: { id: "desc" },
      take: 20,
    });
    const row = rows.find((r) => (r.payloadJson as Record<string, unknown>).username === username);
    expect(row).toBeDefined();
    expect(row?.ip).toBe(i);
    expect(row?.actorUserId).not.toBeNull();
  });

  it("用户名不存在 → LOGIN_FAILED_UNKNOWN 审计行;401 文案与真实用户逐字一致", async () => {
    const { username: real } = await makeUser(21, PASSWORD);
    const ghost = `${GHOST}_u`;
    const iReal = ip(41);
    const iGhost = ip(42);
    redisKeys.push(
      loginFailIpKey(iReal),
      loginFailIpKey(iGhost),
      loginFailKey(ghost),
      loginLockKey(ghost),
      auditUnknownUserKey(ghost, iGhost),
    );

    const realBody = await errBody(await login({ username: real, password: "wrong" }, iReal));
    const ghostBody = await errBody(await login({ username: ghost, password: "wrong" }, iGhost));
    expect(ghostBody.error.code).toBe("INVALID_CREDENTIALS");
    expect(ghostBody.error.message).toBe(realBody.error.message);

    const rows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.LOGIN_FAILED_UNKNOWN },
      orderBy: { id: "desc" },
      take: 20,
    });
    const row = rows.find((r) => (r.payloadJson as Record<string, unknown>).username === ghost);
    expect(row).toBeDefined();
    expect(row?.ip).toBe(iGhost);
    expect(row?.actorUserId).toBeNull();
  });

  it("写放大去重:同 (ip,用户名) 二次失败不再写第二行未知用户审计", async () => {
    const ghost = `${GHOST}_d`;
    const i = ip(43);
    redisKeys.push(
      loginFailIpKey(i),
      loginFailKey(ghost),
      loginLockKey(ghost),
      auditUnknownUserKey(ghost, i),
    );
    const countRows = async () =>
      (
        await prisma.auditLog.findMany({
          where: { action: AUDIT_ACTION.LOGIN_FAILED_UNKNOWN },
          orderBy: { id: "desc" },
          take: 50,
        })
      ).filter((r) => (r.payloadJson as Record<string, unknown>).username === ghost).length;

    const before = await countRows();
    await login({ username: ghost, password: "wrong" }, i);
    const afterFirst = await countRows();
    expect(afterFirst).toBe(before + 1);

    await login({ username: ghost, password: "wrong" }, i);
    expect(await countRows()).toBe(afterFirst);
  });

  it("LOGIN_LOCKED 行的 audit_log.ip 列非空(可按列检索攻击来源)", async () => {
    const { username } = await makeUser(22, PASSWORD);
    const i = ip(44);
    redisKeys.push(loginFailIpKey(i));
    await seedFails(username, MAX_FAILS);

    const res = await login({ username, password: "wrong" }, i);
    expect(res.status).toBe(429);

    const rows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.LOGIN_LOCKED },
      orderBy: { id: "desc" },
      take: 20,
    });
    const row = rows.find((r) => (r.payloadJson as Record<string, unknown>).username === username);
    expect(row).toBeDefined();
    expect(row?.ip).toBe(i);
  });
  it("Turnstile 已启用但密钥缺失 → 登录/注册均失败关闭(422 TURNSTILE_UNAVAILABLE)", async () => {
    await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
    await prisma.systemConfig.createMany({
      data: [
        { key: "turnstile.enabled", value: "true" },
        { key: "turnstile.siteKey", value: "site-x" },
      ],
    });
    await reloadSystemConfig();

    const { username } = await makeUser(23, PASSWORD);
    const res = await login({ username, password: PASSWORD }, ip(45));
    expect(res.status).toBe(422);
    expect((await errBody(res)).error.code).toBe("TURNSTILE_UNAVAILABLE");
    // 失败关闭不计入凭据失败次数
    expect(await redis.get(loginFailKey(username))).toBeNull();

    const regUsername = `t_${RUN}_au_reg_mis`;
    const reg = await registerPost(
      new NextRequest("http://localhost/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: regUsername,
          email: `${regUsername}@test.local`,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(reg.status).toBe(422);
    expect((await errBody(reg)).error.code).toBe("TURNSTILE_UNAVAILABLE");
    expect(await prisma.user.count({ where: { username: regUsername } })).toBe(0);

    await prisma.systemConfig.deleteMany({ where: { key: { in: TS_KEYS } } });
    await reloadSystemConfig();
  });
});

describe("2026-11-06 撞库加固——限流失败关闭(PR-B)", () => {
  it("Redis 故障(计数原语)→ 登录 503 AUTH_UNAVAILABLE,非 500 亦非静默放行", async () => {
    const { username } = await makeUser(30, PASSWORD);
    const i = ip(50);
    redisKeys.push(loginFailIpKey(i));

    // 故障点:限流计数原语(redis.eval)不可用
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    const res = await login({ username, password: "wrong" }, i);
    vi.restoreAllMocks();

    expect(res.status).toBe(503);
    expect((await errBody(res)).error.code).toBe("AUTH_UNAVAILABLE");
    // 失败关闭:计数不可用时不落锁(避免半状态),也不把失败当成功放行
    expect((await checkLock(loginLockKey(username))).locked).toBe(false);
  });

  it("Redis 故障(锁检查)→ 登录 503 AUTH_UNAVAILABLE,不触达凭据校验", async () => {
    const { username } = await makeUser(31, PASSWORD);
    const i = ip(51);
    redisKeys.push(loginFailIpKey(i));

    vi.spyOn(redis, "ttl").mockRejectedValue(new Error("redis down"));
    const res = await login({ username, password: PASSWORD }, i);
    vi.restoreAllMocks();

    expect(res.status).toBe(503);
    expect((await errBody(res)).error.code).toBe("AUTH_UNAVAILABLE");
  });
});

describe("2026-11-06 撞库加固——IP 维解耦 + 哈希背压(PR-C)", () => {
  it("IP 硬阈越阈:只锁攻击源 IP,被攻击账号不受牵连(F2 回归)", async () => {
    const { username } = await makeUser(40, PASSWORD);
    const i = ip(60);
    redisKeys.push(loginFailIpKey(i), loginIpLockKey(i), auditIpSuspiciousKey(i));

    // 预置到硬阈(loginIpMaxFails=50),本次失败即越阈
    await redis.set(loginFailIpKey(i), "50", "EX", 900);
    const res = await login({ username, password: "wrong" }, i);
    expect(res.status).toBe(429);
    expect((await errBody(res)).error.code).toBe("RATE_LIMITED");

    // 锁的是攻击源 IP
    expect((await checkLock(loginIpLockKey(i))).locked).toBe(true);
    // 受害账号不被牵连(旧缺陷:IP 计数越阈锁的是被攻击的用户名 → 批量锁号武器)
    expect((await checkLock(loginLockKey(username))).locked).toBe(false);

    const rows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.LOGIN_IP_SUSPICIOUS },
      orderBy: { id: "desc" },
      take: 20,
    });
    const row = rows.find((r) => (r.payloadJson as Record<string, unknown>).ip === i);
    expect(row).toBeDefined();
    expect((row!.payloadJson as Record<string, unknown>).locked).toBe(true);
    expect(row!.ip).toBe(i);
  });

  it("IP 锁期内:该 IP 全部登录 429 RATE_LIMITED,且不触达凭据校验", async () => {
    const { username } = await makeUser(41, PASSWORD);
    const i = ip(60); // 沿用上一用例的 IP(锁仍在)
    const res = await login({ username, password: PASSWORD }, i);
    expect(res.status).toBe(429);
    expect((await errBody(res)).error.code).toBe("RATE_LIMITED");
    // 账号维不受牵连,且锁期内不跑哈希 → 不计失败
    expect((await checkLock(loginLockKey(username))).locked).toBe(false);
    expect(await redis.get(loginFailKey(username))).toBeNull();
  });

  it("IP 软阈越阈:降速不拒绝(401)+ 软锁键 + 审计 locked:false", async () => {
    const { username } = await makeUser(42, PASSWORD);
    const i = ip(61);
    redisKeys.push(loginFailIpKey(i), loginSoftLockKey(i), auditIpSuspiciousKey(i));

    // 预置到软阈(loginIpSoftFails=20),本次失败即越软阈
    await redis.set(loginFailIpKey(i), "20", "EX", 900);
    const res = await login({ username, password: "wrong" }, i);
    expect(res.status).toBe(401);
    expect((await errBody(res)).error.code).toBe("INVALID_CREDENTIALS");
    expect((await checkLock(loginSoftLockKey(i))).locked).toBe(true);

    const rows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.LOGIN_IP_SUSPICIOUS },
      orderBy: { id: "desc" },
      take: 20,
    });
    const row = rows.find((r) => (r.payloadJson as Record<string, unknown>).ip === i);
    expect(row).toBeDefined();
    expect((row!.payloadJson as Record<string, unknown>).locked).toBe(false);
  });

  it("全局哈希预算耗尽 → 429 SERVER_BUSY,且不跑哈希(不计失败)", async () => {
    const { username } = await makeUser(43, PASSWORD);
    const i = ip(62);
    redisKeys.push(loginFailIpKey(i));

    await redis.set(loginGlobalKey(), String(Number(PINNED_SECURITY["security.loginGlobalMaxPerMin"]) + 1), "EX", 60);
    const res = await login({ username, password: "wrong" }, i);
    await redis.del(loginGlobalKey());

    expect(res.status).toBe(429);
    expect((await errBody(res)).error.code).toBe("SERVER_BUSY");
    // 预算耗尽直接拒:未跑哈希 → 不计凭据失败
    expect(await redis.get(loginFailKey(username))).toBeNull();
  });

  it("并发闸排满 → 排队超时 429 SERVER_BUSY,且不跑哈希", async () => {
    const { username } = await makeUser(44, PASSWORD);
    const i = ip(63);
    redisKeys.push(loginFailIpKey(i));

    // 占满默认并发上限(loginMaxConcurrent=4)
    const slots = [];
    for (let n = 0; n < 4; n += 1) {
      const s = await acquireHashSlot(4, 100);
      expect(s.ok).toBe(true);
      if (s.ok) slots.push(s.slot);
    }
    try {
      const res = await login({ username, password: "wrong" }, i);
      expect(res.status).toBe(429);
      expect((await errBody(res)).error.code).toBe("SERVER_BUSY");
      expect(await redis.get(loginFailKey(username))).toBeNull();
    } finally {
      for (const slot of slots) slot.release();
    }
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
      vi.fn(async () => new Response(JSON.stringify({ success: pass }), { status: 200 })),
    );

    const blocked = await login({ username, password: "wrong", turnstileToken: "tok" }, i);
    expect(blocked.status).toBe(422);
    expect(await redis.get(loginFailKey(username))).toBeNull();

    pass = true;
    const allowed = await login({ username, password: "wrong", turnstileToken: "tok" }, i);
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
