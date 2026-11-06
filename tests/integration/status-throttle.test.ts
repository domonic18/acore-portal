import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { loadSystemConfig, reloadSystemConfig } from "@/lib/config";
import { statusGlobalKey, statusIpKey } from "@/constants/security";
import { GET as statusGet } from "@/app/api/status/route";
import { getServerStatus } from "@/server/services/status/status";
import { pinSystemConfig, restoreSystemConfig } from "../helpers/system-config";

/**
 * 2026-11-06 撞库加固 PR-H——/api/status 单飞 + 限速:
 * ① 并发缓存未命中只放一个探针出去(否则并发请求各自打 SOAP 世界服,F9);
 * ② 按 IP 限速越阈 → 429 RATE_LIMITED;
 * ③ 全局限速越阈 → 429 RATE_LIMITED(不限单 IP 也能护住 worldserver);
 * ④ Redis 故障 → 503 STATUS_UNAVAILABLE(失败关闭,不静默放行)。
 *
 * 阈值全部显式钉住(不依赖库里现值),用完原样还原。
 */
const RUN = Date.now().toString(36);
const PINNED: Record<string, string> = {
  "security.trustedProxyHops": "1",
  "security.statusIpMaxPerMin": "3",
  "security.statusGlobalMaxPerMin": "1000",
  "security.statusUnknownIpMaxPerMin": "100000",
};
const PINNED_KEYS = Object.keys(PINNED);
const STATUS_ENABLED_KEY = "status.enabled";

/** IP 段掺 RUN:限流键跨运行持久,固定 IP 会被自身历史计数锁住 */
const ip = (n: number) => `198.51.${parseInt(RUN, 36) % 254}.${n}`;

let mockBase = "";
let priorStatusEnabled: string | null = null;
/** 钉住的阈值原值(用后原样还原) */
let priorPinned: { key: string; value: string }[] = [];

function getReq(ipAddr?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (ipAddr) headers["x-forwarded-for"] = ipAddr;
  return new NextRequest("http://localhost/api/status", { headers });
}

async function errCode(res: Response): Promise<string> {
  const body = (await res.json()) as { error: { code: string } };
  return body.error.code;
}

/** mock 已执行的 `.server info` 次数(单飞断言基准);兼容裸数组与 {executed} 两种回执形态 */
async function serverInfoCount(): Promise<number> {
  const res = await fetch(`${mockBase}/__executed`);
  const body = (await res.json()) as { command: string }[] | { executed: { command: string }[] };
  const list = Array.isArray(body) ? body : body.executed;
  return (list ?? []).filter((e) => e.command === ".server info").length;
}

beforeAll(async () => {
  mockBase = (await loadSystemConfig()).soap.url.replace(/\/?$/, "");
  await fetch(`${mockBase}/__mode?mode=normal`);

  const row = await prisma.systemConfig.findUnique({ where: { key: STATUS_ENABLED_KEY } });
  priorStatusEnabled = row?.value ?? null;
  await prisma.systemConfig.upsert({
    where: { key: STATUS_ENABLED_KEY },
    create: { key: STATUS_ENABLED_KEY, value: "true" },
    update: { value: "true" },
  });
  priorPinned = await pinSystemConfig(PINNED);
  await reloadSystemConfig();

  await redis.del("status:probe", "status:probe:lastok", "status:probe:lock");
});

afterAll(async () => {
  await restoreSystemConfig(PINNED_KEYS, priorPinned);
  if (priorStatusEnabled === null) {
    await prisma.systemConfig.deleteMany({ where: { key: STATUS_ENABLED_KEY } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key: STATUS_ENABLED_KEY },
      create: { key: STATUS_ENABLED_KEY, value: priorStatusEnabled },
      update: { value: priorStatusEnabled },
    });
  }
  await reloadSystemConfig();
  await redis.del(
    "status:probe",
    "status:probe:lastok",
    "status:probe:lock",
    statusGlobalKey(),
    ...[1, 2, 3, 4, 5, 6].map((n) => statusIpKey(ip(n))),
  );
  await fetch(`${mockBase}/__mode?mode=normal`);
  await prisma.$disconnect();
  await redis.quit();
});

describe("PR-H /api/status 单飞 + 限速", () => {
  it("并发缓存未命中:只放一个探针出去(单飞,不打爆 SOAP 世界服)", async () => {
    await redis.del("status:probe", "status:probe:lastok", "status:probe:lock");
    const before = await serverInfoCount();

    const results = await Promise.all([
      getServerStatus(),
      getServerStatus(),
      getServerStatus(),
      getServerStatus(),
      getServerStatus(),
    ]);

    const after = await serverInfoCount();
    expect(after - before).toBe(1);
    for (const r of results) {
      expect(r.enabled).toBe(true);
      if (r.enabled) expect(r.degraded).toBe(false);
    }
  });

  it("按 IP 限速:越阈 → 429 RATE_LIMITED;阈内 200", async () => {
    const addr = ip(1);
    await redis.del(statusIpKey(addr));
    for (let i = 0; i < 3; i += 1) {
      const res = await statusGet(getReq(addr));
      expect(res.status).toBe(200);
    }
    const over = await statusGet(getReq(addr));
    expect(over.status).toBe(429);
    expect(await errCode(over)).toBe("RATE_LIMITED");
  });

  it("全局限速:不限单 IP 也能护住 worldserver(越阈 → 429)", async () => {
    // 全局桶与按 IP 桶独立:换 IP 仍受限
    await redis.del(statusGlobalKey());
    await prisma.systemConfig.update({
      where: { key: "security.statusGlobalMaxPerMin" },
      data: { value: "1" },
    });
    await reloadSystemConfig();
    try {
      const first = await statusGet(getReq(ip(2)));
      expect(first.status).toBe(200);
      const over = await statusGet(getReq(ip(3)));
      expect(over.status).toBe(429);
      expect(await errCode(over)).toBe("RATE_LIMITED");
    } finally {
      await prisma.systemConfig.update({
        where: { key: "security.statusGlobalMaxPerMin" },
        data: { value: PINNED["security.statusGlobalMaxPerMin"] },
      });
      await reloadSystemConfig();
      await redis.del(statusGlobalKey());
    }
  });

  it("IP 不可判定 → 共享兜底桶:按 IP 阈值不误伤全站", async () => {
    const res = await statusGet(getReq());
    expect(res.status).toBe(200);
  });

  it("Redis 故障 → 503 STATUS_UNAVAILABLE(失败关闭,不静默放行)", async () => {
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    const res = await statusGet(getReq(ip(4)));
    vi.restoreAllMocks();
    expect(res.status).toBe(503);
    expect(await errCode(res)).toBe("STATUS_UNAVAILABLE");
  });

  it("状态功能关闭:直返 {enabled:false},不占限流额度", async () => {
    await prisma.systemConfig.update({
      where: { key: STATUS_ENABLED_KEY },
      data: { value: "false" },
    });
    await reloadSystemConfig();
    try {
      const res = await statusGet(getReq(ip(5)));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enabled: false });
    } finally {
      await prisma.systemConfig.update({
        where: { key: STATUS_ENABLED_KEY },
        data: { value: "true" },
      });
      await reloadSystemConfig();
    }
  });
});
