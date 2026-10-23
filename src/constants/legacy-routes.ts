/**
 * 旧 WP 地址规范化(FR-026):仅 p/page_id/cat 三类查询参数,键形如 p:123/page_id:79/cat:4。
 * 该模块被 middleware(edge runtime)引用,禁止引入 server-only/Prisma 依赖。
 */

export const LEGACY_KEY_PATTERN = /^(p|page_id|cat):(\d+)$/;

/** 多参数并存按 p > page_id > cat 取值;仅纯数字,其余一律未命中(不做模糊猜测) */
export function normalizeLegacyKey(
  p: string | null,
  pageId: string | null,
  cat: string | null,
): string | null {
  const first = [p, pageId, cat].find((v) => v != null && v !== "");
  if (!first || !/^\d+$/.test(first)) return null;
  const name = first === p ? "p" : first === pageId ? "page_id" : "cat";
  return `${name}:${first}`;
}
