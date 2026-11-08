/** 分页切片:页码公式单一来源(前后端共用,无 IO) */
export function pageSlice(page: number, pageSize: number): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** 总页数:行数与页长推导(与 pageSlice 同源) */
export function totalPageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/**
 * 分页切片 + 总页数。
 * 总数未知时先取 pageSlice 并行跑 count,拿到 total 再补 totalPageCount
 * (skip/take 不依赖 total,故 count 与 findMany 可并行)。
 */
export function paginate(
  total: number,
  page: number,
  pageSize: number,
): { totalPages: number; skip: number; take: number } {
  return { totalPages: totalPageCount(total, pageSize), ...pageSlice(page, pageSize) };
}

/** 数字页码窗口:≤7 全列,否则 首/…/当前±1/…/末(null=省略号) */
export function pageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const p of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && p - prev > 1) out.push(null);
    out.push(p);
  }
  return out;
}

/** 翻页链接:剔除空筛选参数,page=1 省略以保持 URL 干净 */
export function buildPageHref(
  basePath: string,
  params: Record<string, string | number | undefined>,
  page: number,
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") sp.set(key, String(value));
  }
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
