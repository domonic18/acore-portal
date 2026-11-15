import Link from "next/link";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";

/**
 * 已选筛选的标签条:每个标签都能单独摘掉(摘掉只影响该项,其余筛选保留)。
 */
export function ShopActiveFilters({
  query,
  categories,
}: {
  query: ShopQuery;
  categories: { slug: string; name: string }[];
}) {
  const chips: { key: string; label: string; href: string }[] = [];

  for (const category of categories) {
    chips.push({
      key: `category:${category.slug}`,
      label: `分类:${category.name}`,
      href: buildShopHref(query, {
        categorySlugs: query.categorySlugs.filter((s) => s !== category.slug),
        page: 1,
      }),
    });
  }

  if (query.keyword) {
    chips.push({
      key: "keyword",
      label: `关键词:${query.keyword}`,
      href: buildShopHref(query, { keyword: null, page: 1 }),
    });
  }

  if (query.minPrice !== null || query.maxPrice !== null) {
    const min = query.minPrice ?? 0;
    const max = query.maxPrice === null ? "不限" : query.maxPrice;
    chips.push({
      key: "price",
      label: `价格:${min} – ${max}`,
      href: buildShopHref(query, { minPrice: null, maxPrice: null, page: 1 }),
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span
          key={chip.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-link/30 bg-link/10 px-2.5 py-1 text-xs text-link"
        >
          {chip.label}
          <Link
            href={chip.href}
            aria-label={`清除筛选 ${chip.label}`}
            className="text-link/70 transition-colors hover:text-heading"
          >
            ✕
          </Link>
        </span>
      ))}
    </div>
  );
}
