import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  SITEMAP_FIXED_PATHS,
  SITEMAP_THREAD_LIMIT,
  buildSitemapEntries,
} from "@/server/services/seo/sitemap";

/**
 * T035 US6 sitemap 条目构建集成(契约 tools-and-seo §sitemap 口径,SC-309 增量半):
 * 条目数与库 count 对账(post/shop/board/thread 四域);draft 文章、draft 商品、
 * listed=0 商品、关闭主题、软删主题排除断言;固定路由 18 条恰好各一次。
 */
const RUN = Date.now().toString(36);
const CAT_SLUG = `t35-acat-${RUN}`;
const PCAT_SLUG = `t35-pcat-${RUN}`;
const BOARD_SLUG = `t35-board-${RUN}`;
const POST_OK = `t35-post-ok-${RUN}`;
const POST_DRAFT = `t35-post-draft-${RUN}`;
const SKU_OK = `t35-sku-ok-${RUN}`;
const SKU_UNLISTED = `t35-sku-unlisted-${RUN}`;
const SKU_DRAFT = `t35-sku-draft-${RUN}`;

let acatId: bigint;
let pcatId: bigint;
let boardId: bigint;
let threadOkId: bigint;
let threadClosedId: bigint;

beforeAll(async () => {
  const acat = await prisma.articleCategory.create({
    data: { slug: CAT_SLUG, name: `T35 文章分类 ${RUN}` },
  });
  acatId = acat.id;
  const pcat = await prisma.productCategory.create({
    data: { slug: PCAT_SLUG, name: `T35 商品分类 ${RUN}` },
  });
  pcatId = pcat.id;
  const board = await prisma.forumBoard.create({
    data: { slug: BOARD_SLUG, name: `T35 版块 ${RUN}` },
  });
  boardId = board.id;

  await prisma.article.createMany({
    data: [
      { slug: POST_OK, title: "T35 已发布", bodyMd: "x", categoryId: acat.id, status: "published", publishedAt: new Date() },
      { slug: POST_DRAFT, title: "T35 草稿", bodyMd: "x", categoryId: acat.id, status: "draft" },
    ],
  });
  await prisma.product.createMany({
    data: [
      { sku: SKU_OK, slug: SKU_OK, name: "T35 上架", description: "", type: "service", status: "published", listed: true, price: 1, categoryId: pcat.id },
      { sku: SKU_UNLISTED, slug: SKU_UNLISTED, name: "T35 隐藏", description: "", type: "service", status: "published", listed: false, price: 1, categoryId: pcat.id },
      { sku: SKU_DRAFT, slug: SKU_DRAFT, name: "T35 商品草稿", description: "", type: "service", status: "draft", listed: true, price: 1, categoryId: pcat.id },
    ],
  });
  const base = { boardId: board.id, authorName: "t35", lastPostAt: new Date() };
  threadOkId = (
    await prisma.forumThread.create({
      data: { ...base, title: "T35 开放主题" },
    })
  ).id;
  threadClosedId = (
    await prisma.forumThread.create({
      data: { ...base, title: "T35 关闭主题", closedAt: new Date() },
    })
  ).id;
  await prisma.forumThread.create({
    data: { ...base, title: "T35 软删主题", deletedAt: new Date() },
  });
});

afterAll(async () => {
  await prisma.forumThread.deleteMany({ where: { boardId } });
  await prisma.forumBoard.delete({ where: { id: boardId } });
  await prisma.article.deleteMany({ where: { categoryId: acatId } });
  await prisma.articleCategory.delete({ where: { id: acatId } });
  await prisma.product.deleteMany({ where: { categoryId: pcatId } });
  await prisma.productCategory.delete({ where: { id: pcatId } });
});

describe("sitemap 条目构建(T035)", () => {
  it("条目数与库 count 对账:post/shop/board/thread 四域一致", async () => {
    const entries = await buildSitemapEntries();
    const [articleTotal, productTotal, boardTotal] = await Promise.all([
      prisma.article.count({ where: { status: "published" } }),
      prisma.product.count({ where: { status: "published", listed: true } }),
      prisma.forumBoard.count(),
    ]);
    const threadTotal = await prisma.forumThread.count({
      where: { deletedAt: null, closedAt: null },
    });

    expect(entries.filter((e) => e.path.startsWith("/post/"))).toHaveLength(articleTotal);
    expect(entries.filter((e) => e.path.startsWith("/shop/"))).toHaveLength(productTotal);
    expect(entries.filter((e) => e.path.startsWith("/forum/thread/"))).toHaveLength(
      Math.min(threadTotal, SITEMAP_THREAD_LIMIT),
    );
    const boardEntries = entries.filter(
      (e) => e.path.startsWith("/forum/") && !e.path.startsWith("/forum/thread/"),
    );
    expect(boardEntries).toHaveLength(boardTotal);
  });

  it("动态条目含合法行、排除 draft/listed=0/关闭/软删;文章带 lastModified", async () => {
    const entries = await buildSitemapEntries();
    const paths = entries.map((e) => e.path);

    expect(paths).toContain(`/post/${POST_OK}`);
    expect(paths).toContain(`/shop/${SKU_OK}`);
    expect(paths).toContain(`/forum/${BOARD_SLUG}`);
    expect(paths).toContain(`/forum/thread/${threadOkId}`);

    expect(paths).not.toContain(`/post/${POST_DRAFT}`);
    expect(paths).not.toContain(`/shop/${SKU_UNLISTED}`);
    expect(paths).not.toContain(`/shop/${SKU_DRAFT}`);
    expect(paths).not.toContain(`/forum/thread/${threadClosedId}`);
    expect(paths.some((p) => p.endsWith("/t35-"))).toBe(false);

    const post = entries.find((e) => e.path === `/post/${POST_OK}`);
    expect(post?.lastModified).toBeInstanceOf(Date);
  });

  it("固定路由 18 条恰好各一次;禁扫路径不存在;主题上限常量=5000", async () => {
    const entries = await buildSitemapEntries();
    for (const fixed of SITEMAP_FIXED_PATHS) {
      expect(entries.filter((e) => e.path === fixed), `${fixed}`).toHaveLength(1);
    }
    expect(SITEMAP_FIXED_PATHS).toHaveLength(18);
    expect(SITEMAP_THREAD_LIMIT).toBe(5000);
    expect(entries.some((e) => e.path.startsWith("/admin"))).toBe(false);
    expect(entries.some((e) => e.path.startsWith("/account"))).toBe(false);
    expect(entries.some((e) => e.path.startsWith("/api"))).toBe(false);
  });
});
