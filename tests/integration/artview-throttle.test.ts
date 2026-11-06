import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { reloadSystemConfig } from "@/lib/config";
import { artviewArticleKey, artviewIpKey } from "@/constants/security";
import { POST as viewPost } from "@/app/api/content/article/[slug]/view/route";
import { pinSystemConfig, restoreSystemConfig } from "../helpers/system-config";

/**
 * 2026-11-06 撞库加固 PR-I——阅读计数写限速:
 * ① 每 (IP, 文章) 窗口闸:同一 IP 对同一篇在窗口内只计一次(防刷阅读量);
 * ② 每 IP 总闸:越阈后该 IP 对**其他**文章也不再计入(防单 IP 刷海量文章);
 * ③ 越阈不报错:照常返回当前阅读数(前台只看到数字稳定);
 * ④ Redis 故障 → 不计入但不 500(阅读量是展示指标,不是安全边界);
 * ⑤ IP 不可判定 → 共享兜底桶,阈值远宽不误伤。
 *
 * 阈值全部显式钉住(不依赖库里现值),用完原样还原。
 */
const RUN = Date.now().toString(36);
const PINNED: Record<string, string> = {
  "security.trustedProxyHops": "1",
  // 每 IP 总闸钉到 2:第 3 次请求即越阈(便于断言,不必打 60 次)
  "security.artviewIpMaxPerMin": "2",
  "security.artviewArticleMax": "1",
  "security.artviewArticleWindowSec": "600",
  "security.unknownIpMaxPerHour": "100000",
};
const PINNED_KEYS = Object.keys(PINNED);
const CAT_SLUG = `tpi-cat-${RUN}`;

/** IP 段掺 RUN:限流键跨运行持久,固定 IP 会被自身历史计数锁住 */
const ip = (n: number) => `198.51.${parseInt(RUN, 36) % 254}.${n}`;

const touchedKeys = new Set<string>();
function trackKeys(bucket: string, slug: string) {
  touchedKeys.add(artviewIpKey(bucket));
  touchedKeys.add(artviewArticleKey(bucket, slug));
}

let catId: bigint;
const createdSlugs: string[] = [];
let priorPinned: { key: string; value: string }[] = [];

async function makeArticle(name: string, status: "draft" | "published" = "published") {
  const slug = `tpi-${name}-${RUN}`;
  await prisma.article.create({
    data: {
      slug,
      title: `TPI ${name}`,
      bodyMd: "<p>正文</p>",
      categoryId: catId,
      status,
      publishedAt: status === "published" ? new Date() : null,
      views: 0,
    },
  });
  createdSlugs.push(slug);
  return slug;
}

function post(slug: string, ipAddr?: string): NextRequest {
  const headers: Record<string, string> = {};
  if (ipAddr) headers["x-forwarded-for"] = ipAddr;
  return new NextRequest(`http://localhost/api/content/article/${slug}/view`, {
    method: "POST",
    headers,
  });
}

/** 路由处理器调用(动态段 params 需显式传入) */
function reportView(slug: string, ipAddr?: string): Promise<Response> {
  return viewPost(post(slug, ipAddr), { params: { slug } });
}

async function viewsOf(slug: string): Promise<number | null> {
  const row = await prisma.article.findUnique({
    where: { slug },
    select: { views: true },
  });
  return row?.views ?? null;
}

async function bodyViews(res: Response): Promise<number> {
  const body = (await res.json()) as { views: number };
  return body.views;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  const cat = await prisma.articleCategory.create({
    data: { name: `TPI 分类 ${RUN}`, slug: CAT_SLUG },
  });
  catId = cat.id;
  priorPinned = await pinSystemConfig(PINNED);
  await reloadSystemConfig();
});

afterAll(async () => {
  await restoreSystemConfig(PINNED_KEYS, priorPinned);
  await reloadSystemConfig();
  await prisma.article.deleteMany({ where: { slug: { in: createdSlugs } } });
  await prisma.articleCategory.deleteMany({ where: { slug: CAT_SLUG } });
  if (touchedKeys.size > 0) await redis.del(...touchedKeys);
  await prisma.$disconnect();
  await redis.quit();
});

describe("PR-I 阅读计数写限速", () => {
  it("同一 IP 对同一篇:窗口内只计一次,第二次返回同一个数字(不报错)", async () => {
    const slug = await makeArticle("same");
    const addr = ip(1);
    trackKeys(addr, slug);

    const first = await reportView(slug, addr);
    expect(first.status).toBe(200);
    expect(await bodyViews(first)).toBe(1);

    const second = await reportView(slug, addr);
    expect(second.status).toBe(200);
    expect(await bodyViews(second)).toBe(1);
    expect(await viewsOf(slug)).toBe(1);
  });

  it("不同 IP 对同一篇:各自计入一次", async () => {
    const slug = await makeArticle("multi");
    const a = ip(2);
    const b = ip(3);
    trackKeys(a, slug);
    trackKeys(b, slug);

    const first = await reportView(slug, a);
    const second = await reportView(slug, b);
    expect(await bodyViews(first)).toBe(1);
    expect(await bodyViews(second)).toBe(2);
    expect(await viewsOf(slug)).toBe(2);
  });

  it("每 IP 总闸越阈:该 IP 对其他文章也不再计入(防单 IP 刷海量文章)", async () => {
    const a = await makeArticle("gate-a");
    const b = await makeArticle("gate-b");
    const c = await makeArticle("gate-c");
    const addr = ip(4);
    for (const s of [a, b, c]) trackKeys(addr, s);

    // 阈值钉在 2 次/分:前两次放行,第三次越阈
    expect((await reportView(a, addr)).status).toBe(200);
    expect((await reportView(b, addr)).status).toBe(200);
    expect(await viewsOf(a)).toBe(1);
    expect(await viewsOf(b)).toBe(1);

    const third = await reportView(c, addr);
    expect(third.status).toBe(200);
    expect(await bodyViews(third)).toBe(0);
    expect(await viewsOf(c)).toBe(0);
  });

  it("IP 不可判定 → 共享兜底桶:阈值远宽,不误伤全站", async () => {
    const slug = await makeArticle("unknown");
    trackKeys("unknown", slug);
    const res = await reportView(slug);
    expect(res.status).toBe(200);
    expect(await bodyViews(res)).toBe(1);
  });

  it("Redis 故障 → 不计入但不 500(失败关闭的是写入,不是页面)", async () => {
    const slug = await makeArticle("redis-down");
    const addr = ip(5);
    trackKeys(addr, slug);
    vi.spyOn(redis, "eval").mockRejectedValue(new Error("redis down"));
    const res = await reportView(slug, addr);
    vi.restoreAllMocks();
    expect(res.status).toBe(200);
    expect(await bodyViews(res)).toBe(0);
    expect(await viewsOf(slug)).toBe(0);
  });

  it("draft 与不存在的文章:404 语义不变", async () => {
    const draft = await makeArticle("draft", "draft");
    const res = await reportView(draft, ip(6));
    expect(res.status).toBe(404);
    const missing = await reportView(`tpi-missing-${RUN}`, ip(6));
    expect(missing.status).toBe(404);
  });

  it("伪造 slug:404 且不造 (IP,文章) 桶键——键基数不随伪造量爆炸", async () => {
    const addr = ip(7);
    const bogus = `tpi-bogus-${RUN}`;
    trackKeys(addr, bogus);

    const res = await reportView(bogus, addr);
    expect(res.status).toBe(404);
    // (IP,文章) 桶键只对真实文章生效:伪造 slug 不进 Redis
    expect(await redis.exists(artviewArticleKey(addr, bogus))).toBe(0);
    // 但每 IP 总闸照常计数:伪造洪水也占预算,不会不限速地打 DB 读
    expect(await redis.exists(artviewIpKey(addr))).toBe(1);
  });
});
