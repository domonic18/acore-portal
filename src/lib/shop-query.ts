import { PRODUCT_SORT, SHOP_QUERY_PARAM, type ProductSortValue } from "@/constants/shop";

/**
 * 商城列表的 URL 查询态(纯函数,前后台共用一份):
 * 筛选/排序/分页全部进 URL ⇒ 可分享、可回退,刷新不丢状态。
 * 分类多选用逗号分隔(`category=a,b,c`),单值与旧书签 `?category=<slug>` 兼容。
 */

export type ShopQuery = {
  /** 选中的分类 slug(可多选) */
  categorySlugs: string[];
  /** 关键词(空串=不过滤) */
  keyword: string;
  /** 生效价下限(含);null=不限 */
  minPrice: number | null;
  /** 生效价上限(含);null=不限 */
  maxPrice: number | null;
  sort: ProductSortValue;
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

/** 非负整数才认;其余一律忽略(防手输垃圾参数把页面打崩) */
function parsePrice(raw: string): number | null {
  if (!/^\d+$/.test(raw.trim())) return null;
  const n = Number.parseInt(raw.trim(), 10);
  return Number.isSafeInteger(n) ? n : null;
}

export function parseShopQuery(params: RawParams): ShopQuery {
  const categoryRaw = first(params[SHOP_QUERY_PARAM.category]);
  const categorySlugs = categoryRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const minPrice = parsePrice(first(params[SHOP_QUERY_PARAM.minPrice]));
  const maxPrice = parsePrice(first(params[SHOP_QUERY_PARAM.maxPrice]));

  const sortRaw = first(params[SHOP_QUERY_PARAM.sort]);
  const sort: ProductSortValue =
    sortRaw === PRODUCT_SORT.PRICE_ASC || sortRaw === PRODUCT_SORT.PRICE_DESC
      ? sortRaw
      : PRODUCT_SORT.NEWEST;

  const pageRaw = Number.parseInt(first(params[SHOP_QUERY_PARAM.page]), 10);

  return {
    categorySlugs: [...new Set(categorySlugs)],
    keyword: first(params[SHOP_QUERY_PARAM.keyword]).trim(),
    // 下限高于上限时交换(用户手输反了不该看到空结果)
    minPrice: minPrice !== null && maxPrice !== null && minPrice > maxPrice ? maxPrice : minPrice,
    maxPrice: minPrice !== null && maxPrice !== null && minPrice > maxPrice ? minPrice : maxPrice,
    sort,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1,
  };
}

/** 覆盖项:键写 null 表示「清掉该筛选」,不写表示沿用原值 */
export type ShopQueryOverrides = {
  categorySlugs?: string[] | null;
  keyword?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  sort?: ProductSortValue | null;
  page?: number | null;
};

/**
 * 由查询态拼链接:空筛选参数不落 URL、page=1 省略、sort=默认省略。
 */
export function buildShopHref(query: ShopQuery, overrides: ShopQueryOverrides = {}): string {
  const slugs = overrides.categorySlugs === undefined ? query.categorySlugs : overrides.categorySlugs ?? [];
  const keyword = overrides.keyword === undefined ? query.keyword : overrides.keyword ?? "";
  const minPrice = overrides.minPrice === undefined ? query.minPrice : overrides.minPrice;
  const maxPrice = overrides.maxPrice === undefined ? query.maxPrice : overrides.maxPrice;
  const sort = overrides.sort === undefined ? query.sort : overrides.sort;
  const page = overrides.page === undefined ? query.page : overrides.page ?? 1;

  const sp = new URLSearchParams();
  if (slugs.length > 0) sp.set(SHOP_QUERY_PARAM.category, slugs.join(","));
  if (keyword) sp.set(SHOP_QUERY_PARAM.keyword, keyword);
  if (minPrice !== null) sp.set(SHOP_QUERY_PARAM.minPrice, String(minPrice));
  if (maxPrice !== null) sp.set(SHOP_QUERY_PARAM.maxPrice, String(maxPrice));
  if (sort && sort !== PRODUCT_SORT.NEWEST) sp.set(SHOP_QUERY_PARAM.sort, sort);
  if (page > 1) sp.set(SHOP_QUERY_PARAM.page, String(page));
  const qs = sp.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

/** 是否处于「无任何筛选」的初始态(空态文案据此分三态) */
export function isPlainShopQuery(query: ShopQuery): boolean {
  return (
    query.categorySlugs.length === 0 &&
    !query.keyword &&
    query.minPrice === null &&
    query.maxPrice === null
  );
}
