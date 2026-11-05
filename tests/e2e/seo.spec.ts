import { expect, test } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T036 US6 SEO E2E(契约 tools-and-seo,SC-309):
 * robots.txt 五条 Disallow+Sitemap 行逐行断言;sitemap.xml 可达+xml 体——
 * 固定路由/动态条目(文章 lastmod)/排除项(draft、listed=0、关闭与软删主题、
 * 禁扫路径)断言;404 页渲染回归。RUN 前缀夹具跑前建跑后清,不依赖种子行。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const CAT_SLUG = `t36-acat-${RUN}`;
const PCAT_SLUG = `t36-pcat-${RUN}`;
const BOARD_SLUG = `t36-board-${RUN}`;
const POST_OK = `t36-post-ok-${RUN}`;
const POST_DRAFT = `t36-post-draft-${RUN}`;
const SKU_OK = `t36-sku-ok-${RUN}`;
const SKU_UNLISTED = `t36-sku-unlisted-${RUN}`;
const PAGE_OK = `t36-page-ok-${RUN}`;
const PAGE_DRAFT = `t36-page-draft-${RUN}`;
const MISSING_PATH = `/nt-${RUN}`;

let acatId: bigint;
let pcatId: bigint;
let boardId: bigint;
let threadOkId: bigint;
let threadClosedId: bigint;
let base = "http://localhost:3000";

test.beforeAll(async () => {
  const appUrl = await prisma.systemConfig.findUnique({
    where: { key: "app.url" },
    select: { value: true },
  });
  if (appUrl?.value) base = appUrl.value.replace(/\/+$/, "");

  const acat = await prisma.articleCategory.create({
    data: { slug: CAT_SLUG, name: `T36 文章分类 ${RUN}` },
  });
  acatId = acat.id;
  const pcat = await prisma.productCategory.create({
    data: { slug: PCAT_SLUG, name: `T36 商品分类 ${RUN}` },
  });
  pcatId = pcat.id;
  const board = await prisma.forumBoard.create({
    data: { slug: BOARD_SLUG, name: `T36 版块 ${RUN}` },
  });
  boardId = board.id;

  await prisma.article.createMany({
    data: [
      { slug: POST_OK, title: "T36 已发布", bodyMd: "x", categoryId: acat.id, status: "published", publishedAt: new Date() },
      { slug: POST_DRAFT, title: "T36 草稿", bodyMd: "x", categoryId: acat.id, status: "draft" },
    ],
  });
  await prisma.product.create({
    data: { sku: SKU_OK, slug: SKU_OK, name: "T36 上架", description: "", type: "service", status: "published", listed: true, price: 1, categoryId: pcat.id },
  });
  await prisma.product.create({
    data: { sku: SKU_UNLISTED, slug: SKU_UNLISTED, name: "T36 隐藏", description: "", type: "service", status: "published", listed: false, price: 1, categoryId: pcat.id },
  });
  await prisma.contentPage.createMany({
    data: [
      { slug: PAGE_OK, title: "T36 已发布页", bodyMd: "x", status: "published" },
      { slug: PAGE_DRAFT, title: "T36 草稿页", bodyMd: "x", status: "draft" },
    ],
  });
  const t = { boardId: board.id, authorName: "t36", lastPostAt: new Date() };
  threadOkId = (
    await prisma.forumThread.create({ data: { ...t, title: "T36 开放主题" } })
  ).id;
  threadClosedId = (
    await prisma.forumThread.create({
      data: { ...t, title: "T36 关闭主题", closedAt: new Date() },
    })
  ).id;
  await prisma.forumThread.create({
    data: { ...t, title: "T36 软删主题", deletedAt: new Date() },
  });
});

test.afterAll(async () => {
  await prisma.forumThread.deleteMany({ where: { boardId } });
  await prisma.forumBoard.delete({ where: { id: boardId } });
  await prisma.article.deleteMany({ where: { categoryId: acatId } });
  await prisma.articleCategory.delete({ where: { id: acatId } });
  await prisma.product.deleteMany({ where: { categoryId: pcatId } });
  await prisma.productCategory.delete({ where: { id: pcatId } });
  await prisma.contentPage.deleteMany({ where: { slug: { in: [PAGE_OK, PAGE_DRAFT] } } });
  await prisma.$disconnect();
});

test.describe("US6 SEO(T035/T036,SC-309)", () => {
  test("robots.txt:五条 Disallow+Sitemap 行逐行一致", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/plain");
    // Next 14 序列化:User-Agent 大写;rules 与 sitemap 之间有空行,过滤后逐行对
    const lines = (await res.text())
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    expect(lines).toEqual([
      "User-Agent: *",
      "Disallow: /admin",
      "Disallow: /account",
      "Disallow: /api",
      "Disallow: /cart",
      "Disallow: /checkout",
      `Sitemap: ${base}/sitemap.xml`,
    ]);
  });

  test("sitemap.xml:可达+固定路由+动态条目+lastmod", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const body = await res.text();

    expect(body).toContain("<urlset");
    for (const fixed of [
      "/",
      "/progression",
      "/forum",
      "/shop",
      "/online",
      "/online-players",
      "/playermap",
      "/hardcore",
      "/banlist",
      "/dkp",
      "/about",
      "/tutorial",
      "/agreement",
      "/convention",
    ]) {
      const loc = fixed === "/" ? `${base}/` : `${base}${fixed}`;
      expect(body, fixed).toContain(`<loc>${loc}</loc>`);
    }

    // 已发布内容页(issue #101:此前只固定收录 4 个静态页,其余公开内容页漏收录)
    for (const page of [
      "/sitemap",
      "/devlog",
      "/hardcore-mode",
      "/mount-guide",
      "/hd-client",
      "/client-extract",
      "/login-troubleshoot",
      "/patch-guide",
      `/${PAGE_OK}`,
    ]) {
      expect(body, page).toContain(`<loc>${base}${page}</loc>`);
    }

    expect(body).toContain(`<loc>${base}/post/${POST_OK}</loc>`);
    expect(body, "文章条目带 lastmod").toContain("<lastmod>");
    expect(body).toContain(`<loc>${base}/shop/${SKU_OK}</loc>`);
    expect(body).toContain(`<loc>${base}/forum/${BOARD_SLUG}</loc>`);
    expect(body).toContain(`<loc>${base}/forum/thread/${threadOkId}</loc>`);
  });

  test("sitemap.xml:排除 draft/listed=0/关闭主题/禁扫路径", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    const body = await res.text();

    expect(body).not.toContain(POST_DRAFT);
    expect(body).not.toContain(SKU_UNLISTED);
    expect(body, "draft 内容页不收录").not.toContain(`/${PAGE_DRAFT}`);
    expect(body).not.toContain(`/forum/thread/${threadClosedId}`);
    for (const banned of ["/admin", "/account", "/api", "/cart", "/checkout"]) {
      expect(body, banned).not.toContain(`<loc>${base}${banned}`);
    }
  });

  test("404 页渲染回归:状态 404+兜底文案", async ({ page }) => {
    const res = await page.goto(MISSING_PATH);
    expect(res?.status()).toBe(404);
    await expect(page.getByText("页面不存在或已迁移")).toBeVisible();
  });
});
