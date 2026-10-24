import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  getArticleBySlug,
  incrementArticleViews,
  listArchiveArticles,
} from "@/server/services/content/articles";
import { getPublishedPage } from "@/server/services/content/pages";
import {
  listProgressionTimeline,
  resolveProgressionPosition,
} from "@/server/services/progression/progression";

/**
 * T021 US3 内容查询层集成(quickstart S3,FR-209~211/SC-203 增量半):
 * 归档分页 10/页+publishedAt 排序+draft 不可见;views 原子自增 50 并发无损;
 * 静态页 slug 查询(draft 不可见);渐进时间轴排序(NULLS LAST)+
 * 指针解析(指针缺省/指向已删节点回退最新 open)。
 */
const RUN = Date.now().toString(36);
const CAT_SLUG = `t21-cat-${RUN}`;
const PAGE_SLUG = `t21-page-${RUN}`;
const NODE_KEYS = [`t21-open1-${RUN}`, `t21-open2-${RUN}`, `t21-null-${RUN}`, `t21-locked-${RUN}`];
const PROG_KEY = "progression.current_node_id";
const created: { articles: string[]; nodeIds: bigint[] } = {
  articles: [],
  nodeIds: [],
};

let catId: bigint;
let pointerNodeId: bigint;
let savedPointer: string | null = null;

async function makeArticle(
  slug: string,
  daysAgo: number,
  status: "draft" | "published",
) {
  const a = await prisma.article.create({
    data: {
      slug: `${slug}-${RUN}`,
      title: `T21 ${slug}`,
      bodyMd: `<p>正文</p>`,
      categoryId: catId,
      status,
      publishedAt:
        status === "published"
          ? new Date(Date.now() - daysAgo * 86_400_000)
          : null,
      views: 0,
    },
    select: { slug: true },
  });
  created.articles.push(a.slug);
  return a.slug;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  const cat = await prisma.articleCategory.create({
    data: { name: `T21 分类`, slug: CAT_SLUG },
  });
  catId = cat.id;
  // 指针行快照:测试后原样恢复(人工指针是运营数据,不得吞掉)
  const row = await prisma.systemConfig.findUnique({
    where: { key: PROG_KEY },
    select: { value: true },
  });
  savedPointer = row?.value ?? null;
});

afterAll(async () => {
  await prisma.articleTag.deleteMany({
    where: { article: { slug: { in: created.articles } } },
  });
  await prisma.article.deleteMany({ where: { slug: { in: created.articles } } });
  await prisma.contentPage.deleteMany({ where: { slug: PAGE_SLUG } });
  await prisma.progressionNode.deleteMany({
    where: { legacyWpKey: { in: NODE_KEYS } },
  });
  await prisma.articleCategory.deleteMany({ where: { slug: CAT_SLUG } });
  await prisma.tag.deleteMany({ where: { slug: `t21-tag-${RUN}` } });
  if (savedPointer == null) {
    await prisma.systemConfig.deleteMany({ where: { key: PROG_KEY } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key: PROG_KEY },
      create: { key: PROG_KEY, value: savedPointer },
      update: { value: savedPointer },
    });
  }
  await prisma.$disconnect();
});

describe("归档查询(T021 FR-209)", () => {
  it("分页 10/页+publishedAt 倒序,跨页齐全,draft 不可见", async () => {
    // 12 published(日期交错)+2 draft → total=12
    for (let i = 0; i < 12; i++) {
      await makeArticle(`arch-${String(i).padStart(2, "0")}`, i + 1, "published");
    }
    await makeArticle("draft-x", 0, "draft");
    await makeArticle("draft-y", 0, "draft");

    const page1 = await listArchiveArticles({ categorySlug: CAT_SLUG });
    expect(page1.total).toBe(12);
    expect(page1.items).toHaveLength(10);
    const dates = page1.items.map((a) => a.publishedAt!.getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates); // 倒序
    expect(page1.items.every((a) => a.slug.endsWith(RUN))).toBe(true);

    const page2 = await listArchiveArticles({
      categorySlug: CAT_SLUG,
      page: 2,
    });
    expect(page2.items).toHaveLength(2);
    const slugs = new Set([...page1.items, ...page2.items].map((a) => a.slug));
    expect(slugs.size).toBe(12); // 跨页无重叠
    expect(page2.items[0]!.publishedAt!.getTime()).toBeLessThan(
      page1.items.at(-1)!.publishedAt!.getTime(),
    );
  });

  it("越界页返回空清单,total 不变", async () => {
    const out = await listArchiveArticles({
      categorySlug: CAT_SLUG,
      page: 9,
    });
    expect(out.items).toHaveLength(0);
    expect(out.total).toBe(12);
  });
});

describe("views 原子自增(T021 SC-203 增量半)", () => {
  it("50 并发上报 → views 精确 +50,draft 不计数", async () => {
    const slug = await makeArticle("hot", 1, "published");
    const draftSlug = await makeArticle("hot-draft", 1, "draft");
    await Promise.all(
      Array.from({ length: 50 }, () => incrementArticleViews(slug)),
    );
    const row = await prisma.article.findUniqueOrThrow({
      where: { slug },
      select: { views: true },
    });
    expect(row.views).toBe(50);
    expect(await incrementArticleViews(draftSlug)).toBeNull();
  });
});

describe("静态页与文章详情查询(T021 FR-210)", () => {
  it("published 页可达,draft 页不可见,缺失返回 null", async () => {
    await prisma.contentPage.create({
      data: { slug: PAGE_SLUG, title: "T21 页", bodyMd: "<p>页正文</p>", status: "published" },
    });
    const page = await getPublishedPage(PAGE_SLUG);
    expect(page?.title).toBe("T21 页");
    await prisma.contentPage.update({
      where: { slug: PAGE_SLUG },
      data: { status: "draft" },
    });
    expect(await getPublishedPage(PAGE_SLUG)).toBeNull();
    expect(await getPublishedPage(`nope-${RUN}`)).toBeNull();
  });

  it("文章详情带分类与标签,draft 不可见", async () => {
    const slug = await makeArticle("detail", 2, "published");
    const tag = await prisma.tag.upsert({
      where: { slug: `t21-tag-${RUN}` },
      create: { name: `T21 标签`, slug: `t21-tag-${RUN}` },
      update: {},
    });
    const article = await prisma.article.findUniqueOrThrow({
      where: { slug },
      select: { id: true },
    });
    await prisma.articleTag.create({
      data: { articleId: article.id, tagId: tag.id },
    });
    const detail = await getArticleBySlug(slug);
    expect(detail?.title).toBe("T21 detail");
    expect(detail?.category.slug).toBe(CAT_SLUG);
    expect(detail?.tags).toHaveLength(1);
    expect(await getArticleBySlug(`nope-${RUN}`)).toBeNull();
  });
});

describe("渐进时间轴与指针(T021 R8)", () => {
  // 隔离:2099 日期段与极大 sort 保证断言不受 dev 库存量 28 节点干扰
  const T = (name: string) => `T21-${RUN} ${name}`;
  let nLocked: bigint;
  let nOpen1: bigint;
  let nOpen2: bigint;
  let nNull: bigint;

  it("排序 phaseDate 升序 NULLS LAST,同日期按 sort", async () => {
    const mk = (
      key: string,
      title: string,
      phaseDate: Date | null,
      sort: number,
      status: "open" | "locked",
    ) =>
      prisma.progressionNode.create({
        data: {
          title,
          phaseDate,
          status,
          sort,
          legacyWpKey: key,
          bodyMd: `<p>${title}</p>`,
        },
        select: { id: true },
      });
    // 故意乱序插入:locked(最早) → open(2099 边界段) → null 日期(极大 sort)
    nLocked = (await mk(NODE_KEYS[3]!, T("锁定期"), new Date("2023-01-01"), 0, "locked")).id;
    nOpen1 = (await mk(NODE_KEYS[0]!, T("开放一"), new Date("2099-01-01"), 0, "open")).id;
    nOpen2 = (await mk(NODE_KEYS[1]!, T("开放二"), new Date("2099-02-01"), 0, "open")).id;
    nNull = (await mk(NODE_KEYS[2]!, T("未定档"), null, 999_999_999, "open")).id;
    created.nodeIds.push(nLocked, nOpen1, nOpen2, nNull);
    pointerNodeId = nOpen1;

    const mine = (await listProgressionTimeline()).filter((n) =>
      n.title.includes(RUN),
    );
    expect(mine.map((n) => n.title.split(" ")[1])).toEqual([
      "锁定期",
      "开放一",
      "开放二",
      "未定档",
    ]);
  });

  it("指针有效 → current=指针节点,next=排序后继", async () => {
    await prisma.systemConfig.upsert({
      where: { key: PROG_KEY },
      create: { key: PROG_KEY, value: String(pointerNodeId) },
      update: { value: String(pointerNodeId) },
    });
    const pos = await resolveProgressionPosition();
    expect(pos.current?.id).toBe(nOpen1);
    expect(pos.next?.id).toBe(nOpen2);
  });

  it("指针指向已删节点 → 回退时间轴末位 open,next 殿后无", async () => {
    await prisma.systemConfig.upsert({
      where: { key: PROG_KEY },
      create: { key: PROG_KEY, value: "999999999" },
      update: { value: "999999999" },
    });
    const pos = await resolveProgressionPosition();
    expect(pos.current?.id).toBe(nNull); // 全表最新 open(日期 null 殿后+sort 极大)
    expect(pos.next).toBeNull();
  });

  it("指针缺省 → 同样回退最新 open", async () => {
    await prisma.systemConfig.deleteMany({ where: { key: PROG_KEY } });
    const pos = await resolveProgressionPosition();
    expect(pos.current?.id).toBe(nNull);
    expect(pos.next).toBeNull();
  });
});
