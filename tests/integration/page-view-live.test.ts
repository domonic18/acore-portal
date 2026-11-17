import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { reloadSystemConfig } from "@/lib/config";
import { SESSION } from "@/constants/session";
import { createSession, revokeAllSessions } from "@/lib/auth/session";
import { POST as trackPageView } from "@/app/api/track/pageview/route";
import {
  getOnlineVisitors,
  getRecentPageViews,
} from "@/server/services/stats/page-view";
import { PAGE_VIEW_ONLINE_REDIS_PREFIX } from "@/constants/page-view";
import { pinSystemConfig, restoreSystemConfig } from "../helpers/system-config";

/**
 * 看板「网站在线/最近访问」集成(2026-11-17 口径,经用户确认):
 * ① 登录访客埋点落原始 IP + userId(路由解析会话);游客 userId 为 null;
 * ② getRecentPageViews:最新条目在前,账号名批量回查,游客显示 null;
 * ③ getOnlineVisitors:登录按账号去重(同账号换 IP 不重复计数、路径随最新访问更新)、
 *    游客按 IP 去重;total/userCount/guestCount 三口径一致。
 * redis 在线键 dev 集成/E2E 共享:只清理本文件创建的键(RUN 后缀隔离)。
 */
const RUN = Date.now().toString(36);
const username = `t_${RUN}_live`.slice(0, 32);
const IP_OCTET = Number.parseInt(RUN, 36) % 254;
const IP_A = `203.2.${IP_OCTET}.10`;
const IP_B = `203.2.${IP_OCTET}.20`;
const IP_C = `203.2.${IP_OCTET}.30`;

const PINNED: Record<string, string> = { "security.trustedProxyHops": "1" };
let pinnedPrior: { key: string; value: string }[] = [];

let userId = 0n;
const paths = [`/pvl-${RUN}/a`, `/pvl-${RUN}/b`, `/pvl-${RUN}/c`, `/pvl-${RUN}/d`];
const onlineKeys = [
  `stats:online:u:${userId}`,
  `stats:online:g:${IP_A}`,
  `stats:online:g:${IP_B}`,
  `stats:online:g:${IP_C}`,
];

function pvReq(path: string, opts?: { ip?: string; cookie?: string }): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (opts?.ip) headers.set("x-forwarded-for", opts.ip);
  if (opts?.cookie) headers.set("cookie", `${SESSION.ACCESS_COOKIE}=${opts.cookie}`);
  return new NextRequest("http://localhost/api/track/pageview", {
    method: "POST",
    body: JSON.stringify({ path }),
    headers,
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  pinnedPrior = await pinSystemConfig(PINNED);
  await reloadSystemConfig();

  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `livetest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true },
  });
  userId = user.id;
  onlineKeys[0] = `stats:online:u:${userId}`;
});

afterAll(async () => {
  await restoreSystemConfig(Object.keys(PINNED), pinnedPrior);
  await reloadSystemConfig();
  await redis.del(...onlineKeys);
  await prisma.pageViewEvent.deleteMany({ where: { path: { startsWith: `/pvl-${RUN}` } } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.pointAccount.deleteMany({ where: { userId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await revokeAllSessions(userId.toString());
  await redis.quit();
  await prisma.$disconnect();
});

describe("看板在线/最近访问集成", () => {
  it("登录访客埋点:路由解析会话,落原始 IP + userId;游客 userId 为 null", async () => {
    const { accessToken } = await createSession(userId, "user");
    const res = await trackPageView(pvReq(paths[0]!, { ip: IP_B, cookie: accessToken }));
    expect(res.status).toBe(200);

    const row = await prisma.pageViewEvent.findFirstOrThrow({
      where: { path: paths[0]! },
      orderBy: { id: "desc" },
    });
    expect(row.ip).toBe(IP_B);
    expect(row.userId).toBe(userId);

    const guestRes = await trackPageView(pvReq(paths[1]!, { ip: IP_A }));
    expect(guestRes.status).toBe(200);
    const guestRow = await prisma.pageViewEvent.findFirstOrThrow({
      where: { path: paths[1]! },
      orderBy: { id: "desc" },
    });
    expect(guestRow.ip).toBe(IP_A);
    expect(guestRow.userId).toBeNull();
  });

  it("getRecentPageViews:最新条目在前,账号名回查,游客为 null", async () => {
    const rows = await getRecentPageViews(10);
    const mine = rows.filter((r) => r.path.startsWith(`/pvl-${RUN}`));
    expect(mine.map((r) => r.path)).toEqual([paths[1], paths[0]]);
    expect(mine[0]).toMatchObject({ path: paths[1]!, ip: IP_A, username: null });
    expect(mine[1]).toMatchObject({ path: paths[0]!, ip: IP_B, username });
  });

  it("getOnlineVisitors:游客按 IP 去重;登录按账号去重且路径随最新访问更新", async () => {
    // 游客 IP_A
    await trackPageView(pvReq(paths[2]!, { ip: IP_A }));
    const onlyGuest = await getOnlineVisitors();
    const guestRow = onlyGuest.rows.find((r) => r.ip === IP_A && r.path === paths[2]);
    expect(guestRow).toMatchObject({ username: null, isUser: false });

    // 同账号在 IP_B/IP_C 两端访问:仍只算 1 个在线账号,路径取最新
    const { accessToken } = await createSession(userId, "user");
    await trackPageView(pvReq(paths[2]!, { ip: IP_B, cookie: accessToken }));
    await trackPageView(pvReq(paths[3]!, { ip: IP_C, cookie: accessToken }));

    const online = await getOnlineVisitors();
    const userRows = online.rows.filter((r) => r.isUser && r.username === username);
    expect(userRows).toHaveLength(1);
    expect(userRows[0]).toMatchObject({ path: paths[3], ip: IP_C });
    expect(online.guestCount).toBeGreaterThanOrEqual(1);
    expect(online.userCount).toBeGreaterThanOrEqual(1);
    expect(online.total).toBe(online.rows.length);
    expect(online.total).toBe(online.userCount + online.guestCount);
  });

  it("在线键族前缀契约:E2E/清理按同一常量前缀全清", () => {
    expect(PAGE_VIEW_ONLINE_REDIS_PREFIX).toBe("stats:online");
  });
});
