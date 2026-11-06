import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { reloadSystemConfig } from "@/lib/config";
import { emailChangeIpKey, pwresetIpKey, registerIpKey } from "@/constants/security";
import { PASSWORD_ALGO } from "@/constants/password";
import { POST as registerPost } from "@/app/api/auth/register/route";
import { POST as forgotPost } from "@/app/api/auth/forgot-password/route";
import { POST as resetPost } from "@/app/api/auth/reset-password/route";
import { POST as confirmEmailPost } from "@/app/api/account/confirm-email/route";
import { pinSystemConfig, restoreSystemConfig } from "../helpers/system-config";

/**
 * 2026-11-06 撞库加固 PR-G——未鉴权端点按 IP 限速:
 * 注册 / 找回密码申请 / 找回密码提交 / 换邮箱确认四个入口按来源 IP 限速,
 * 越阈只影响该 IP 自己的请求(不牵连任何账号);
 * IP 不可判定时落共享「未知 IP」兜底桶(阈值远宽,不误伤全站);
 * Redis 故障失败关闭(503),不得静默放行。
 *
 * 阈值全部显式钉住(不依赖库里现值),用完原样还原。
 */
const RUN = Date.now().toString(36);
const PINNED: Record<string, string> = {
  "security.trustedProxyHops": "1",
  "security.registerIpMaxPerHour": "3",
  "security.pwresetIpMaxPerHour": "3",
  "security.emailChangeIpMaxPerHour": "3",
  "security.unknownIpMaxPerHour": "100000",
};
const PINNED_KEYS = Object.keys(PINNED);

/** IP 段掺 RUN:限流键跨运行持久,固定 IP 会被自身历史计数锁住 */
const ip = (n: number) => `198.51.${parseInt(RUN, 36) % 254}.${n}`;

function post(url: string, body: unknown, ipAddr?: string): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (ipAddr) headers["x-forwarded-for"] = ipAddr;
  return new NextRequest(`http://localhost${url}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers,
  });
}

async function errCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

/** 计数桶清理:限流键跨测试运行持久,不复位会互相污染 */
const touchedKeys = new Set<string>();
function trackKeys(bucket: string) {
  for (const c of [registerIpKey, pwresetIpKey, emailChangeIpKey]) touchedKeys.add(c(bucket));
}

/** 已占用用户名:注册占用语义(422 USERNAME_TAKEN)的断言基准 */
const TAKEN_USERNAME = `t_${RUN}_rl`;
const TAKEN_EMAIL = `${TAKEN_USERNAME}@test.local`;

/** 钉住的阈值原值(用后原样还原) */
let priorPinned: { key: string; value: string }[] = [];

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  await prisma.user.create({
    data: {
      username: TAKEN_USERNAME,
      email: TAKEN_EMAIL,
      passwordHash: "pending-test",
      passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
    },
  });
  priorPinned = await pinSystemConfig(PINNED);
  await reloadSystemConfig();
});

afterAll(async () => {
  await restoreSystemConfig(PINNED_KEYS, priorPinned);
  await reloadSystemConfig();
  await prisma.user.deleteMany({ where: { username: TAKEN_USERNAME } });
  if (touchedKeys.size > 0) await redis.del(...touchedKeys);
  await prisma.$disconnect();
  await redis.quit();
});

describe("PR-G 未鉴权端点按 IP 限速", () => {
  it("注册:越阈 → 429 RATE_LIMITED;阈内 422 占用语义不变(契约不改)", async () => {
    const addr = ip(11);
    trackKeys(addr);
    const body = { username: TAKEN_USERNAME, email: "free@example.test" };

    // 阈内:请求走到业务逻辑,占用语义仍是 422(按用户决策保留契约)
    for (let i = 0; i < 3; i += 1) {
      const res = await registerPost(post("/api/auth/register", body, addr));
      expect(res.status).toBe(422);
      expect(await errCode(res)).toBe("USERNAME_TAKEN");
    }

    // 越阈:直接 429,不触达业务逻辑
    const over = await registerPost(post("/api/auth/register", body, addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("注册:畸形请求体同样计入(限速排在参数校验之前)", async () => {
    const addr = ip(12);
    trackKeys(addr);
    const bad = { username: "", email: "not-an-email" };
    for (let i = 0; i < 3; i += 1) {
      const res = await registerPost(post("/api/auth/register", bad, addr));
      expect(res.status).toBe(422);
    }
    const over = await registerPost(post("/api/auth/register", bad, addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("找回密码申请:越阈 → 429;阈内恒定 202(不泄露邮箱存在性)", async () => {
    const addr = ip(13);
    trackKeys(addr);
    const body = { email: `ghost_${RUN}@test.local` };
    for (let i = 0; i < 3; i += 1) {
      const res = await forgotPost(post("/api/auth/forgot-password", body, addr));
      expect(res.status).toBe(202);
    }
    const over = await forgotPost(post("/api/auth/forgot-password", body, addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("找回密码提交:越阈 → 429(与申请共用同一个按 IP 桶)", async () => {
    const addr = ip(14);
    trackKeys(addr);
    const body = { token: "x".repeat(20), password: "ResetPass123" };
    for (let i = 0; i < 3; i += 1) {
      const res = await resetPost(post("/api/auth/reset-password", body, addr));
      expect(res.status).toBe(422);
      expect(await errCode(res)).toBe("INVALID_TOKEN");
    }
    const over = await resetPost(post("/api/auth/reset-password", body, addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("换邮箱确认:越阈 → 429(409 EMAIL_TAKEN 语义不变,需有效令牌才可能触发)", async () => {
    const addr = ip(15);
    trackKeys(addr);
    const body = { token: "x".repeat(20) };
    for (let i = 0; i < 3; i += 1) {
      const res = await confirmEmailPost(post("/api/account/confirm-email", body, addr));
      expect(res.status).toBe(422);
      expect(await errCode(res)).toBe("INVALID_TOKEN");
    }
    const over = await confirmEmailPost(post("/api/account/confirm-email", body, addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("IP 不可判定 → 共享兜底桶:按 IP 的阈值不误伤全站", async () => {
    // 无 XFF 头 → IP 不可判定,请求落「未知 IP」共享桶(阈值 unknownIpMaxPerHour=100000)
    const body = { username: TAKEN_USERNAME, email: "free@example.test" };
    for (let i = 0; i < 5; i += 1) {
      const res = await registerPost(post("/api/auth/register", body));
      expect(res.status).toBe(422);
      expect(await errCode(res)).toBe("USERNAME_TAKEN");
    }
  });

  it("Redis 故障 → 503 AUTH_UNAVAILABLE(失败关闭,不静默放行)", async () => {
    const addr = ip(16);
    trackKeys(addr);
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    const res = await registerPost(
      post("/api/auth/register", { username: "x", email: "x@test.local" }, addr),
    );
    vi.restoreAllMocks();
    expect(res.status).toBe(503);
    expect(await errCode(res)).toBe("AUTH_UNAVAILABLE");
  });
});
