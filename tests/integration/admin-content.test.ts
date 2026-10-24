import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { RESERVED_SLUGS } from "@/constants/content";
import { createSession, revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import {
  ContentAdminError,
  deleteArticle,
  deleteArticleCategory,
  deletePage,
  deleteTag,
  listAdminArticles,
  saveArticle,
  saveArticleCategory,
  savePage,
  saveTag,
  setArticleTags,
} from "@/server/services/content/admin";
// T029 越权回归直接打路由处理器(M2 admin-guard 同源守卫)
import { POST as articlesPost } from "@/app/api/admin/articles/route";

/**
 * T029 US4 内容后台集成(quickstart S4,FR-215~217):
 * 文章 CRUD(slug 冲突 SLUG_CONFLICT/发布→publishedAt 写入/下稿→置空/标签全量替换/审计
 * content_article_saved)·分类删除有引用 CATEGORY_IN_USE·页面 slug 命中
 * RESERVED_SLUGS SLUG_RESERVED·越权 401/403+admin_access_violation 回归。
 */
const RUN = Date.now().toString(36);
const CAT_SLUG = `t29-cat-${RUN}`;
const CAT2_SLUG = `t29-cat2-${RUN}`;
const ART_PREFIX = `t29-art-${RUN}-`;
const TAG_PREFIX = `t29-tag-${RUN}`;
const PAGE_PREFIX = `t29-page-${RUN}-`;

let catId = 0n;
let cat2Id = 0n;
const guardUids = [9900001n, 9900002n]; // admin / moderator(不建 User 行,沿用 admin-guard 模式)

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ContentAdminError) return err.code;
    throw err;
  }
  throw new Error("expected ContentAdminError");
}

function adminReq(path: string, init?: { method?: string; body?: string }): NextRequest {
  const headers = new Headers(init?.body ? { "content-type": "application/json" } : {});
  return new NextRequest(`http://localhost${path}`, { method: init?.method, body: init?.body, headers });
}

async function moderatorReq(path: string, body: unknown): Promise<NextRequest> {
  const { accessToken } = await createSession(guardUids[1]!, "moderator");
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      cookie: `${SESSION.ACCESS_COOKIE}=${accessToken}`,
    }),
    body: JSON.stringify(body),
  });
}

async function lastAudit(actorUserId: bigint, action: string) {
  return prisma.auditLog.findFirstOrThrow({
    where: { action, actorUserId },
    orderBy: { id: "desc" },
  });
}

async function makeArticle(slug: string, status: "draft" | "published" = "published") {
  return saveArticle({
    title: `T29 ${slug}`,
    slug,
    categoryId: catId,
    bodyMd: `<p>${slug}</p>`,
    status,
    actorUserId: guardUids[0]!,
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  catId = (
    await prisma.articleCategory.create({
      data: { name: `T29 分类 ${RUN}`, slug: CAT_SLUG },
      select: { id: true },
    })
  ).id;
  cat2Id = (
    await prisma.articleCategory.create({
      data: { name: `T29 分类二 ${RUN}`, slug: CAT2_SLUG },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.articleTag.deleteMany({
    where: { article: { slug: { startsWith: ART_PREFIX } } },
  });
  await prisma.article.deleteMany({ where: { slug: { startsWith: ART_PREFIX } } });
  await prisma.tag.deleteMany({ where: { slug: { startsWith: TAG_PREFIX } } });
  await prisma.contentPage.deleteMany({ where: { slug: { startsWith: PAGE_PREFIX } } });
  await prisma.articleCategory.deleteMany({
    where: { slug: { in: [CAT_SLUG, CAT2_SLUG] } },
  });
  for (const uid of guardUids) {
    await revokeAllSessions(uid.toString());
    await revokeAllRefreshTokens(uid.toString());
  }
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: guardUids }, action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION },
        { action: { startsWith: "content_" }, category: AUDIT_CATEGORY.CONTENT },
      ],
    },
  });
  await redis.quit();
  await prisma.$disconnect();
});

describe("文章 CRUD(T029 FR-215)", () => {
  it("新建 draft 无 publishedAt;发布写入;下稿置空;重复发布保留首发时间", async () => {
    const { id } = await makeArticle(`${ART_PREFIX}flow`, "draft");
    const draftRow = await prisma.article.findUniqueOrThrow({
      where: { id },
      select: { status: true, publishedAt: true },
    });
    expect(draftRow.status).toBe("draft");
    expect(draftRow.publishedAt).toBeNull();
    await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_ARTICLE_SAVED); // 审计已落

    // draft→published:写入 publishedAt
    await saveArticle({
      id, title: `T29 flow`, slug: `${ART_PREFIX}flow`, categoryId: catId,
      bodyMd: `<p>flow</p>`, status: "published", actorUserId: guardUids[0]!,
    });
    const publishedRow = await prisma.article.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    });
    const firstPublishAt = publishedRow.publishedAt;
    expect(firstPublishAt).not.toBeNull();

    // published→published:保留首发时间
    await new Promise((r) => setTimeout(r, 10));
    await saveArticle({
      id, title: `T29 flow v2`, slug: `${ART_PREFIX}flow`, categoryId: catId,
      bodyMd: `<p>flow2</p>`, status: "published", actorUserId: guardUids[0]!,
    });
    const republishRow = await prisma.article.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    });
    expect(republishRow.publishedAt?.getTime()).toBe(firstPublishAt!.getTime());

    // published→draft:置空
    await saveArticle({
      id, title: `T29 flow`, slug: `${ART_PREFIX}flow`, categoryId: catId,
      bodyMd: `<p>flow</p>`, status: "draft", actorUserId: guardUids[0]!,
    });
    const unpublishRow = await prisma.article.findUniqueOrThrow({
      where: { id },
      select: { publishedAt: true },
    });
    expect(unpublishRow.publishedAt).toBeNull();
  });

  it("slug 显式冲突 → SLUG_CONFLICT;slug 缺省自动生成", async () => {
    await makeArticle(`${ART_PREFIX}a1`);
    await expect(
      errCode(makeArticle(`${ART_PREFIX}a1`)),
    ).resolves.toBe("SLUG_CONFLICT");
    const { id } = await saveArticle({
      title: `T29 无 slug 文章 ${RUN}`,
      categoryId: catId,
      bodyMd: "<p>x</p>",
      status: "draft",
      actorUserId: guardUids[0]!,
    });
    const row = await prisma.article.findUniqueOrThrow({ where: { id }, select: { slug: true } });
    expect(row.slug).not.toBe("");
    await prisma.article.delete({ where: { id } });
  });

  it(" categoryId 不存在 → CATEGORY_NOT_FOUND;删除文章级联标签关联", async () => {
    await expect(
      errCode(
        saveArticle({
          title: "T29 x", slug: `${ART_PREFIX}x`, categoryId: 999999999n,
          bodyMd: "<p>x</p>", status: "draft", actorUserId: guardUids[0]!,
        }),
      ),
    ).resolves.toBe("CATEGORY_NOT_FOUND");

    const tag = await saveTag({ name: `T29 标签 ${RUN}`, slug: `${TAG_PREFIX}-main` });
    const { id } = await makeArticle(`${ART_PREFIX}del`);
    await setArticleTags(id, [tag.id], guardUids[0]!);
    expect(
      await prisma.articleTag.count({ where: { articleId: id } }),
    ).toBe(1);
    await deleteArticle(id, guardUids[0]!);
    await expect(prisma.article.findUnique({ where: { id } })).resolves.toBeNull();
    await expect(prisma.articleTag.count({ where: { articleId: id } })).resolves.toBe(0);
    await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_ARTICLE_DELETED);
  });

  it("列表分页含 draft,q 按标题过滤", async () => {
    for (const i of [1, 2, 3]) await makeArticle(`${ART_PREFIX}list-${i}`);
    await makeArticle(`${ART_PREFIX}list-draft`, "draft");
    const page1 = await listAdminArticles({ q: `t29-art-${RUN}-list`, page: 1, pageSize: 2 });
    expect(page1.total).toBe(4); // 3 published + 1 draft(draft 不隐藏)
    expect(page1.items).toHaveLength(2);
    expect(page1.totalPages).toBe(2);
    const all = await listAdminArticles({ q: `t29-art-${RUN}-list`, pageSize: 50 });
    expect(all.items.some((a) => a.status === "draft")).toBe(true);
  });
});

describe("标签与分类(T029 FR-215)", () => {
  it("标签同名/同 slug → DUPLICATE;更新走 id", async () => {
    const tag = await saveTag({ name: `T29 标签A ${RUN}`, slug: `${TAG_PREFIX}-a` });
    await expect(errCode(saveTag({ name: `T29 标签A ${RUN}`, slug: `${TAG_PREFIX}-b` }))).resolves.toBe("DUPLICATE");
    await expect(errCode(saveTag({ name: `T29 标签B ${RUN}`, slug: `${TAG_PREFIX}-a` }))).resolves.toBe("DUPLICATE");
    const renamed = await saveTag({ id: tag.id, name: `T29 标签A2 ${RUN}`, slug: `${TAG_PREFIX}-a` });
    expect(renamed.id).toBe(tag.id);
  });

  it("分类删除有引用 → CATEGORY_IN_USE;无引用放行;slug 冲突 → SLUG_CONFLICT", async () => {
    await makeArticle(`${ART_PREFIX}catref`);
    await expect(errCode(deleteArticleCategory(catId, guardUids[0]!))).resolves.toBe("CATEGORY_IN_USE");
    await deleteArticleCategory(cat2Id, guardUids[0]!); // 无引用放行
    await expect(
      errCode(saveArticleCategory({ name: "T29 撞名", slug: CAT_SLUG, sort: 9 })),
    ).resolves.toBe("SLUG_CONFLICT");
    await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_TAXONOMY_DELETED);
  });
});

describe("静态页管理(T029 FR-216/R15)", () => {
  it("slug 命中 RESERVED_SLUGS → SLUG_RESERVED(全清单逐个)", async () => {
    for (const reserved of RESERVED_SLUGS) {
      await expect(
        errCode(
          savePage({
            slug: reserved, title: "T29 保留", bodyMd: "<p>x</p>", status: "draft",
            actorUserId: guardUids[0]!,
          }),
        ),
      ).resolves.toBe("SLUG_RESERVED");
    }
  });

  it("slug 冲突 → SLUG_CONFLICT;发布/更新/删除闭环", async () => {
    const slug = `${PAGE_PREFIX}main`;
    const { id } = await savePage({ slug, title: "T29 页", bodyMd: "<p>v1</p>", status: "draft", actorUserId: guardUids[0]! });
    await expect(
      errCode(savePage({ slug, title: "T29 页撞", bodyMd: "<p>x</p>", status: "draft", actorUserId: guardUids[0]! })),
    ).resolves.toBe("SLUG_CONFLICT");
    await savePage({ id, slug, title: "T29 页 v2", bodyMd: "<p>v2</p>", status: "published", sortOrder: 5, actorUserId: guardUids[0]! });
    const row = await prisma.contentPage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("published");
    expect(row.sortOrder).toBe(5);
    await deletePage(id, guardUids[0]!);
    await expect(prisma.contentPage.findUnique({ where: { id } })).resolves.toBeNull();
    await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_PAGE_DELETED);
  });
});

describe("越权回归(T029,quickstart S4)", () => {
  it("未登录 POST /api/admin/articles → 401", async () => {
    const res = await articlesPost(
      adminReq("/api/admin/articles", {
        method: "POST",
        body: JSON.stringify({ title: "x", categoryId: 1, bodyMd: "x", status: "draft" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it("moderator → 403 + admin_access_violation(path=/api/admin/articles)", async () => {
    const req = await moderatorReq("/api/admin/articles", {
      title: "x", categoryId: Number(catId), bodyMd: "x", status: "draft",
    });
    const res = await articlesPost(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    const audit = await lastAudit(guardUids[1]!, AUDIT_ACTION.ADMIN_ACCESS_VIOLATION);
    expect(audit.category).toBe(AUDIT_CATEGORY.SECURITY);
    expect((audit.payloadJson as { path?: string }).path).toBe("/api/admin/articles");
  });
});
