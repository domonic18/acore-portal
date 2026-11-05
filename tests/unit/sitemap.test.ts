import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findManyArticle: vi.fn(),
  findManyProduct: vi.fn(),
  findManyForumBoard: vi.fn(),
  findManyForumThread: vi.fn(),
  findManyContentPage: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    article: { findMany: mocks.findManyArticle },
    product: { findMany: mocks.findManyProduct },
    forumBoard: { findMany: mocks.findManyForumBoard },
    forumThread: { findMany: mocks.findManyForumThread },
    contentPage: { findMany: mocks.findManyContentPage },
  },
}));

import {
  SITEMAP_FIXED_PATHS,
  buildSitemapEntries,
} from "@/server/services/seo/sitemap";

/**
 * T035 US6 sitemap 条目构建单元测试(issue #101 回归):
 * CI 只跑 tests/unit,这里把集成测试里写的关键口径
 * (内容页收录、draft 排除、路径无重复)用 mock 数据库再断言一次。
 */

describe("buildSitemapEntries 单元回归(T035/#101)", () => {
  beforeEach(() => {
    mocks.findManyArticle.mockResolvedValue([]);
    mocks.findManyProduct.mockResolvedValue([]);
    mocks.findManyForumBoard.mockResolvedValue([]);
    mocks.findManyForumThread.mockResolvedValue([]);
    mocks.findManyContentPage.mockResolvedValue([]);
  });

  it("固定路由按 SITEMAP_FIXED_PATHS 顺序输出且各出现一次", async () => {
    const entries = await buildSitemapEntries();
    const fixedEntries = entries.slice(0, SITEMAP_FIXED_PATHS.length);

    expect(fixedEntries.map((e) => e.path)).toEqual(
      SITEMAP_FIXED_PATHS.map((p) => String(p)),
    );
    for (const fixed of SITEMAP_FIXED_PATHS) {
      expect(entries.filter((e) => e.path === fixed)).toHaveLength(1);
    }
  });

  it("内容页:已发布收录、draft 排除、数量一致、带 lastModified", async () => {
    const updatedAt = new Date("2026-11-05T12:00:00Z");
    mocks.findManyContentPage.mockResolvedValue([
      { slug: "about", updatedAt },
      { slug: "devlog", updatedAt },
      { slug: "ascension-guide", updatedAt },
    ]);

    const entries = await buildSitemapEntries();
    const paths = entries.map((e) => e.path);

    expect(paths).toContain("/about");
    expect(paths).toContain("/devlog");
    expect(paths).toContain("/ascension-guide");
    expect(paths.filter((p) => p === "/about")).toHaveLength(1);

    const pageEntries = entries.filter(
      (e) =>
        !e.path.startsWith("/post/") &&
        !e.path.startsWith("/shop/") &&
        !e.path.startsWith("/forum/") &&
        !SITEMAP_FIXED_PATHS.includes(e.path),
    );
    expect(pageEntries).toHaveLength(3);
    for (const entry of pageEntries) {
      expect(entry.lastModified).toBeInstanceOf(Date);
    }

    expect(mocks.findManyContentPage).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "published" } }),
    );
  });

  it("全量路径无重复", async () => {
    mocks.findManyContentPage.mockResolvedValue([
      { slug: "about", updatedAt: new Date() },
      { slug: "tutorial", updatedAt: new Date() },
    ]);
    mocks.findManyArticle.mockResolvedValue([
      { slug: "hello", updatedAt: new Date() },
    ]);

    const entries = await buildSitemapEntries();
    const paths = entries.map((e) => e.path);

    expect(new Set(paths).size).toBe(paths.length);
  });
});
