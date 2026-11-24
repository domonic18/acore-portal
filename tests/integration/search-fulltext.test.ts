import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { searchSite } from "@/server/services/search";

/**
 * 站内搜索集成(混合检索关键词路):ngram FULLTEXT 真库中文检索,
 * 覆盖五实体发布口径 / 分组 URL 契约 / FAQ 判别 / 标题加权 / 短查询空结果。
 * 语义路在此走降级(embedding 通道未配置 → searchSite.semantic=false)。
 *
 * ⚠ 本文件是 **FULLTEXT 索引健康的守卫**,禁当"环境问题"删用例:
 *   InnoDB FULLTEXT 索引失配时,**旧行照常召回、新插入的行不进索引**
 *   (症状＝搜得到老内容、搜不到新内容,且不报错);
 *   本文件用"刚插入的行能否被召回"把这种失配暴露出来(2026-11-20 实测命中)。
 *   库侧失配的处置:scripts/ops/rebuild-fulltext-index.sql(OPTIMIZE 重建)。
 */
const RUN = Date.now().toString(36);
const A_SLUG_PREFIX = `srch-a-${RUN}-`;
const P_SLUG_PREFIX = `srch-p-${RUN}-`;
const PAGE_SLUG_PREFIX = `srch-page-${RUN}-`;
const BOARD_SLUG = `srch-board-${RUN}`;
const THREAD_TITLE_PREFIX = `玄晶矿石产量讨论 ${RUN}`;
const CAT_SLUG_PREFIX = `srch-cat-${RUN}`;

let articleCatId = 0n;
let productCatId = 0n;
let productId = 0n;
let boardId = 0n;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`; // 服务不可达时快速失败(先 make up)

  const aCat = await prisma.articleCategory.create({
    data: { name: `搜索分类 ${RUN}`, slug: `${CAT_SLUG_PREFIX}-a` },
    select: { id: true },
  });
  articleCatId = aCat.id;

  const pCat = await prisma.productCategory.create({
    data: { name: `搜索商品分类 ${RUN}`, slug: `${CAT_SLUG_PREFIX}-p`, sort: 99 },
    select: { id: true },
  });
  productCatId = pCat.id;

  const product = await prisma.product.create({
    data: {
      sku: `itemsend_srch${RUN}`,
      slug: `${P_SLUG_PREFIX}main`,
      name: `玄晶矿石礼包 ${RUN}`,
      description: "十枚装的玄晶矿石,锻造必备。",
      type: "game_item",
      status: "published",
      listed: true,
      price: 100,
      categoryId: productCatId,
    },
    select: { id: true },
  });
  productId = product.id;

  const board = await prisma.forumBoard.create({
    data: { slug: BOARD_SLUG, name: `搜索版块 ${RUN}` },
    select: { id: true },
  });
  boardId = board.id;

  await prisma.article.createMany({
    data: [
      {
        slug: `${A_SLUG_PREFIX}title-hit`,
        title: `玄晶矿石采集攻略 ${RUN}`,
        bodyMd: "暮色森林深处可以采集到玄晶矿石,它是锻造的核心材料。",
        status: "published",
        categoryId: articleCatId,
      },
      {
        // 标题加权对照组:仅正文命中,同词应排在标题命中之后
        slug: `${A_SLUG_PREFIX}body-hit`,
        title: `锻造材料一览 ${RUN}`,
        bodyMd: "锻造所需材料包括玄晶矿石与熔岩核心。",
        status: "published",
        categoryId: articleCatId,
      },
      {
        // 下稿不可索引口径:标题命中但不返回
        slug: `${A_SLUG_PREFIX}draft`,
        title: `未发布的矿石手记 ${RUN}`,
        bodyMd: "草稿正文。",
        status: "draft",
        categoryId: articleCatId,
      },
    ],
  });

  await prisma.contentPage.create({
    data: {
      slug: `${PAGE_SLUG_PREFIX}usage`,
      title: `矿石使用说明 ${RUN}`,
      bodyMd: "玄晶矿石的使用规范与保管注意事项。",
      status: "published",
    },
  });

  await prisma.productFaq.create({
    data: {
      productId,
      question: `玄晶矿石怎么获得?${RUN}`,
      answer: "完成矿石采集任务后系统邮件发放。",
      sort: 0,
    },
  });

  await prisma.forumThread.createMany({
    data: [
      {
        boardId,
        title: `${THREAD_TITLE_PREFIX} 主帖`,
        authorName: "srch-tester",
        lastPostAt: new Date(),
      },
      {
        // 软删不可索引口径
        boardId,
        title: `${THREAD_TITLE_PREFIX} 已删`,
        authorName: "srch-tester",
        lastPostAt: new Date(),
        deletedAt: new Date(),
      },
    ],
  });
});

afterAll(async () => {
  await prisma.forumThread.deleteMany({ where: { boardId } });
  await prisma.forumBoard.deleteMany({ where: { id: boardId } });
  await prisma.productFaq.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: P_SLUG_PREFIX } } });
  await prisma.contentPage.deleteMany({ where: { slug: { startsWith: PAGE_SLUG_PREFIX } } });
  await prisma.article.deleteMany({ where: { slug: { startsWith: A_SLUG_PREFIX } } });
  await prisma.articleCategory.deleteMany({ where: { id: articleCatId } });
  await prisma.productCategory.deleteMany({ where: { id: productCatId } });
  await prisma.$disconnect();
});

describe("searchSite 混合检索(关键词路真库)", () => {
  it("中文 ngram 短语命中:五实体各归其组,URL/FAQ 判别契约正确", async () => {
    const r = await searchSite({ q: "玄晶矿石" });
    expect(r.semantic).toBe(false); // 语义通道未配置 → 纯关键词降级

    const articles = r.groups.find((g) => g.group === "articles")!;
    expect(articles.total).toBeGreaterThanOrEqual(2);
    const titleHit = articles.hits.find((h) => h.url === `/post/${A_SLUG_PREFIX}title-hit`);
    expect(titleHit).toBeDefined();
    expect(titleHit!.snippet).toContain("玄晶矿石");

    const pages = r.groups.find((g) => g.group === "pages")!;
    expect(pages.hits.map((h) => h.url)).toContain(`/${PAGE_SLUG_PREFIX}usage`);

    const products = r.groups.find((g) => g.group === "products")!;
    const productHit = products.hits.find((h) => !h.faq);
    const faqHit = products.hits.find((h) => h.faq);
    expect(productHit?.url).toBe(`/shop/${P_SLUG_PREFIX}main`);
    expect(faqHit?.url).toBe(`/shop/${P_SLUG_PREFIX}main`);
    expect(faqHit?.title).toContain("玄晶矿石怎么获得");

    const forum = r.groups.find((g) => g.group === "forum")!;
    const threadHit = forum.hits.find((h) => h.title.includes("主帖"));
    expect(threadHit?.url).toMatch(/^\/forum\/thread\/\d+$/);
    // 软删主题不可见
    expect(forum.hits.some((h) => h.title.includes("已删"))).toBe(false);
    // 下稿文章不可见
    expect(articles.hits.some((h) => h.url.includes("draft"))).toBe(false);
  });

  it("标题命中加权:同词标题命中排在仅正文命中之前", async () => {
    const r = await searchSite({ q: `玄晶矿石 ${RUN}` });
    const articles = r.groups.find((g) => g.group === "articles")!;
    const urls = articles.hits.map((h) => h.url);
    expect(urls.indexOf(`/post/${A_SLUG_PREFIX}title-hit`)).toBeLessThan(
      urls.indexOf(`/post/${A_SLUG_PREFIX}body-hit`),
    );
  });

  it("短查询(单中文字符)返回空结果不报错", async () => {
    const r = await searchSite({ q: "矿" });
    expect(r.total).toBe(0);
    expect(r.groups.every((g) => g.hits.length === 0)).toBe(true);
  });

  it("无命中查询返回空结果", async () => {
    const r = await searchSite({ q: `绝对不存在的词${RUN}zzz` });
    expect(r.total).toBe(0);
  });

  it("分组过滤:只查 products 组时其余组不参与", async () => {
    const r = await searchSite({ q: "玄晶矿石", groups: ["products"] });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.group).toBe("products");
    expect(r.groups[0]!.hits.length).toBeGreaterThanOrEqual(2);
  });
});
