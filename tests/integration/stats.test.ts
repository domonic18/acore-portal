import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { POINT_TX_TYPE } from "@/constants/points";
import { createSession, revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import { POST as trackNotFound } from "@/app/api/track/not-found/route";
import { POST as trackPageView } from "@/app/api/track/pageview/route";
import { GET as adminStatsRoute } from "@/app/api/admin/stats/route";
import { getDashboard } from "@/server/services/stats/dashboard";
import { notFoundDayKey } from "@/server/services/stats/not-found";

/**
 * M4 US4 统计域集成(T025/T026,quickstart S4):
 * 404 采集:合法 path HINCRBY+48h TTL;外域/协议相对/非斜杠 422;256 截断;IP 30 次/分 429;
 * 看板五区块:articleTop 只含 published 且按 views 降序、404 合并今日键、
 * 订单/积分/注册 7 天基线差值法;API 守卫 anon 401/user 403(审计)/admin 200 形状;
 * redis 键 RUN 后缀隔离(dev redis 集成/E2E 共享),用后 hdel 清理。
 */
const RUN = Date.now().toString(36);
const BASE = BigInt(`95${(Number.parseInt(RUN, 36) % 100000).toString().padStart(5, "0")}`);
const UID = BASE; // 守卫三角色与看板 fixture 共用一个 uid
const RL_IP = `ntip-${RUN}`;
const PV_IP = `pvip-${RUN}`;
const TRACKED_FIELDS: string[] = [];

/** 日键单一来源:service 收口(issue #74),测试不再自行拼键 */
const todayKey = (): string => notFoundDayKey();

function trackReq(path: string, ip?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-forwarded-for", ip);
  return new NextRequest("http://localhost/api/track/not-found", {
    method: "POST",
    body: JSON.stringify({ path }),
    headers,
  });
}

function reqWithCookie(token: string | undefined, path = "/api/admin/stats"): NextRequest {
  const headers = new Headers(token ? { cookie: `${SESSION.ACCESS_COOKIE}=${token}` } : {});
  return new NextRequest(`http://localhost${path}`, { headers });
}

function pvReq(path: string, ip?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-forwarded-for", ip);
  return new NextRequest("http://localhost/api/track/pageview", {
    method: "POST",
    body: JSON.stringify({ path }),
    headers,
  });
}

const username = `t_${RUN}_st`.slice(0, 32);
const ORDER_NO = `M4NT${RUN.toUpperCase().slice(-8)}A`;
const CAT_SLUG = `st-${RUN}`;

let userId = 0n;
let baseline: Awaited<ReturnType<typeof getDashboard>>;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  baseline = await getDashboard();

  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `sttest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true },
  });
  userId = user.id;

  await prisma.order.create({
    data: { orderNo: ORDER_NO, userId, pointCost: 100 },
  });
  await prisma.pointTransaction.create({
    data: {
      userId,
      type: POINT_TX_TYPE.SHOP_PAYMENT,
      amount: -100,
      balanceAfter: 0,
      remark: "NT 看板 7 天交易 fixture",
    },
  });

  const category = await prisma.articleCategory.create({
    data: { name: `NT 看板分类 ${RUN}`, slug: CAT_SLUG },
    select: { id: true },
  });
  const article = (slug: string, title: string, views: number, status: "draft" | "published") =>
    prisma.article.create({
      data: {
        slug,
        title,
        bodyMd: `# ${title}`,
        categoryId: category.id,
        status,
        publishedAt: status === "published" ? new Date() : null,
        views,
      },
      select: { slug: true },
    });
  // dev 库存量文章阅读数可能已挤满 top10,fixture 用极大值保证进榜/排除断言稳定
  await article(`st-${RUN}-high`, `NT 高阅读 ${RUN}`, 1_000_000_000, "published");
  await article(`st-${RUN}-low`, `NT 低阅读 ${RUN}`, 999_999_999, "published");
  await article(`st-${RUN}-draft`, `NT 草稿 ${RUN}`, 2_000_000_000, "draft");
});

afterAll(async () => {
  if (TRACKED_FIELDS.length > 0) {
    await redis.hdel(todayKey(), ...TRACKED_FIELDS);
  }
  await redis.del(`rl:404:${RL_IP}`);
  await redis.del(`rl:pview:${PV_IP}`, `rl:pview:${PV_IP}-uv`, `rl:pview:${PV_IP}-uv-other`);

  await prisma.pageViewEvent.deleteMany({ where: { path: { startsWith: `/pv-${RUN}` } } });
  await prisma.article.deleteMany({ where: { slug: { startsWith: `st-${RUN}` } } });
  await prisma.articleCategory.deleteMany({ where: { slug: CAT_SLUG } });
  await prisma.pointTransaction.deleteMany({ where: { userId } });
  await prisma.order.deleteMany({ where: { orderNo: ORDER_NO } });
  await prisma.notification.deleteMany({ where: { userId } });
  await prisma.pointAccount.deleteMany({ where: { userId } });
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await revokeAllSessions(userId.toString());
  await revokeAllRefreshTokens(userId.toString());
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION, actorUserId: userId },
  });
  await redis.quit();
  await prisma.$disconnect();
});

describe("M4 US4 404 采集 /api/track/not-found(T025)", () => {
  it("合法 path 两次上报:HINCRBY 累计+键 TTL 覆盖看板 7 日窗口(issue #74)", async () => {
    const path = `/nt-${RUN}/page`;
    TRACKED_FIELDS.push(path);

    const res1 = await trackNotFound(trackReq(path));
    expect(res1.status).toBe(200);
    const res2 = await trackNotFound(trackReq(path));
    expect(await res2.json()).toEqual({ ok: true });

    expect(Number(await redis.hget(todayKey(), path))).toBe(2);
    const ttl = await redis.ttl(todayKey());
    expect(ttl).toBeGreaterThan(7 * 24 * 3600); // 覆盖看板 7 日查询窗口
    expect(ttl).toBeLessThanOrEqual(8 * 24 * 3600);
  });

  it("非法 path 422 且零写入:外域/协议相对/非斜杠/含换行", async () => {
    for (const bad of ["https://evil.com/a", "//evil.com/a", "no-slash", "/line\nbreak"]) {
      const res = await trackNotFound(trackReq(bad));
      expect(res.status, bad).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "VALIDATION_ERROR",
      );
    }
    const fields = await redis.hkeys(todayKey());
    expect(fields.some((f) => f.includes("evil.com") || f === "no-slash")).toBe(false);
  });

  it("超 256 截断存储:入库字段恰为 slice(0,256)", async () => {
    const raw = `/nt-${RUN}/${"a".repeat(300)}`;
    TRACKED_FIELDS.push(raw.slice(0, 256));

    const res = await trackNotFound(trackReq(raw));
    expect(res.status).toBe(200);
    expect(Number(await redis.hget(todayKey(), raw.slice(0, 256)))).toBe(1);
    const fields = await redis.hkeys(todayKey());
    expect(fields.some((f) => f.length > 256)).toBe(false);
  });

  it("IP 轻限速:同 IP 第 31 次 429 RATE_LIMITED(30/60s)", async () => {
    for (let i = 0; i < 30; i++) {
      const path = `/nt-${RUN}/rl/${i}`;
      TRACKED_FIELDS.push(path);
      const res = await trackNotFound(trackReq(path, RL_IP));
      expect(res.status, `#${i}`).toBe(200);
    }
    const blocked = await trackNotFound(trackReq(`/nt-${RUN}/rl/over`, RL_IP));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe(
      "RATE_LIMITED",
    );
  });
});

describe("M4 US4 页面访问采集 /api/track/pageview(替代 umami)", () => {
  it("合法 path 落库:看板 PV 累加、Top 页面含该路径", async () => {
    const path = `/pv-${RUN}/page`;
    const before = await getDashboard();

    const res = await trackPageView(pvReq(path, PV_IP));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await prisma.pageViewEvent.findFirstOrThrow({
      where: { path },
      orderBy: { id: "desc" },
    });
    expect(row.path).toBe(path);
    expect(row.visitorId).toHaveLength(64);
    expect(row.visitorId).not.toContain(PV_IP);

    const after = await getDashboard();
    expect(after.pageView.pv - before.pageView.pv).toBe(1);
    expect(after.pageView.topPages.find((p) => p.path === path)?.count).toBe(1);
  });

  it("同 IP 同日同访客:同 IP 两次上报 UV 只 +1;换 IP 则 UV +1", async () => {
    const path = `/pv-${RUN}/uv`;
    const ip = `${PV_IP}-uv`;
    const before = await getDashboard();

    await trackPageView(pvReq(path, ip));
    await trackPageView(pvReq(path, ip));
    const mid = await getDashboard();
    expect(mid.pageView.uv - before.pageView.uv).toBe(1);
    expect(mid.pageView.pv - before.pageView.pv).toBe(2);

    await trackPageView(pvReq(path, `${ip}-other`));
    const after = await getDashboard();
    expect(after.pageView.uv - mid.pageView.uv).toBe(1);
    expect(after.pageView.pv - mid.pageView.pv).toBe(1);
  });

  it("非法 path 422 且零写入:外域/协议相对/非斜杠/含换行", async () => {
    for (const bad of ["https://evil.com/a", "//evil.com/a", "no-slash", "/line\nbreak"]) {
      const res = await trackPageView(pvReq(bad, PV_IP));
      expect(res.status, bad).toBe(422);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe(
        "VALIDATION_ERROR",
      );
    }
    const rows = await prisma.pageViewEvent.count({
      where: { path: { contains: "evil.com" } },
    });
    expect(rows).toBe(0);
  });

  it("后台路径不入库:/admin 与 /wp-admin 排除(422)", async () => {
    for (const p of ["/admin", "/admin/stats", "/wp-admin"]) {
      const res = await trackPageView(pvReq(p, PV_IP));
      expect(res.status, p).toBe(422);
    }
    const rows = await prisma.pageViewEvent.count({
      where: { path: { in: ["/admin", "/admin/stats", "/wp-admin"] } },
    });
    expect(rows).toBe(0);
  });
});

describe("M4 US4 看板五区块聚合 getDashboard(T026)", () => {
  it("articleTop 只含 published 且 views 降序;draft 高阅读不入选", async () => {
    const data = await getDashboard();
    const high = data.articleTop.findIndex((a) => a.slug === `st-${RUN}-high`);
    const low = data.articleTop.findIndex((a) => a.slug === `st-${RUN}-low`);
    expect(high, "两篇 published 都在 top10").toBeGreaterThanOrEqual(0);
    expect(low).toBeGreaterThanOrEqual(0);
    expect(high, "views 降序").toBeLessThan(low);
    expect(data.articleTop.some((a) => a.slug === `st-${RUN}-draft`)).toBe(false);
    const row = data.articleTop.find((a) => a.slug === `st-${RUN}-high`)!;
    expect(row.title).toBe(`NT 高阅读 ${RUN}`);
    expect(row.views).toBe(1_000_000_000);
  });

  it("notFoundTop 合并今日 redis 键:hset 的 RUN 路径出现且计数正确", async () => {
    const path = `/nt-${RUN}/dash`;
    TRACKED_FIELDS.push(path);
    await redis.hset(todayKey(), path, 3);

    const data = await getDashboard();
    expect(data.notFoundTop.find((n) => n.path === path)).toEqual({
      path,
      count: 3,
    });
  });

  it("orders7d/users7d 基线差值:+1 单/+100 积分/+1 注册", async () => {
    const data = await getDashboard();
    expect(data.orders7d.count - baseline.orders7d.count).toBe(1);
    expect(data.orders7d.pointsSpent - baseline.orders7d.pointsSpent).toBe(100);
    expect(data.users7d.newRegistered - baseline.users7d.newRegistered).toBe(1);
  });

  it("online 区块:服务状态关闭/降级时回落 {source:degraded,current:0} 不抛错", async () => {
    const data = await getDashboard();
    expect(["probe", "degraded"]).toContain(data.online.source);
    expect(data.online.current).toBeGreaterThanOrEqual(0);
  });
});

describe("M4 US4 GET /api/admin/stats(T026 契约 api-admin-m4)", () => {
  it("anon 401 UNAUTHORIZED;user 403 FORBIDDEN+越权审计;admin 200 八键形状", async () => {
    const anon = await adminStatsRoute(reqWithCookie(undefined));
    expect(anon.status).toBe(401);
    expect(((await anon.json()) as { error: { code: string } }).error.code).toBe("UNAUTHORIZED");

    const { accessToken } = await createSession(UID, "user");
    const userRes = await adminStatsRoute(reqWithCookie(accessToken));
    expect(userRes.status).toBe(403);
    expect(((await userRes.json()) as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION, actorUserId: UID },
      orderBy: { id: "desc" },
    });
    expect(audit.category).toBe(AUDIT_CATEGORY.SECURITY);

    const admin = await createSession(UID, "admin");
    const okRes = await adminStatsRoute(reqWithCookie(admin.accessToken));
    expect(okRes.status).toBe(200);
    const body = (await okRes.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(
      ["articleTop", "funnel", "notFoundTop", "online", "orders7d", "pageView", "users7d"].sort(),
    );
  });
});

