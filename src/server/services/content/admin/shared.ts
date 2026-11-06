import "server-only";

/**
 * 内容后台最小集(api-admin-m3 契约,FR-215~217,Q4 无版本历史/审核流):
 * slug 唯一(冲突 SLUG_CONFLICT);页面 slug 保留字 SLUG_RESERVED;分类删除有引用
 * CATEGORY_IN_USE;发布流转写/清 publishedAt(重复发布保留首发时间);
 * 写操作审计 category=content 只记 id/slug 不记正文(T048 脱敏口径)。
 * CORE_PAGE_PROTECTED:核心静态页(CORE_PAGE_SLUGS)被站内固定链接引用,
 * 禁止删除与改别名,否则 /about、/sitemap 等路由直接 404(issue #94)。
 */

export class ContentAdminError extends Error {
  constructor(
    public code:
      | "SLUG_CONFLICT"
      | "SLUG_RESERVED"
      | "CATEGORY_IN_USE"
      | "DUPLICATE"
      | "NOT_FOUND"
      | "CATEGORY_NOT_FOUND"
      | "CORE_PAGE_PROTECTED",
    message?: string,
  ) {
    super(message ?? `content_admin_error: ${code}`);
    this.name = "ContentAdminError";
  }
}

export type ContentStatus = "draft" | "published";
