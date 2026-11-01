/**
 * 旧 WP 地址规范化(FR-026/M3 扩展 FR-213/FR-219):
 * 内容三键 p/page_id/cat + 论坛两键 topic/forum,键形如 p:123/topic:45。
 * 该模块被 middleware(edge runtime)引用,禁止引入 server-only/Prisma 依赖。
 */

export const LEGACY_KEY_PATTERN = /^(p|page_id|cat|topic|forum):(\d+)$/;

/** 旧站域名:迁移正文里的绝对链接在渲染期改回站内相对地址,交给 middleware 走 route_map */
export const LEGACY_SITE_HOSTS = ["lokta.cn", "www.lokta.cn"] as const;

/** 旧站绝对地址 → 站内相对地址(非旧站/非 http(s) 返回 null) */
export function toSameSiteHref(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!(LEGACY_SITE_HOSTS as readonly string[]).includes(url.hostname)) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** 多参数并存按 p > page_id > cat > topic > forum 取值;仅纯数字,其余一律未命中(不做模糊猜测) */
export function normalizeLegacyKey(
  p: string | null,
  pageId: string | null,
  cat: string | null,
  topic?: string | null,
  forum?: string | null,
): string | null {
  const first = [p, pageId, cat, topic ?? null, forum ?? null].find(
    (v) => v != null && v !== "",
  );
  if (!first || !/^\d+$/.test(first)) return null;
  const name =
    first === p
      ? "p"
      : first === pageId
        ? "page_id"
        : first === cat
          ? "cat"
          : first === topic
            ? "topic"
            : "forum";
  return `${name}:${first}`;
}
