import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { ContentPanel } from "@/components/site/content-panel";
import { PaginationNav } from "@/components/ui/pagination";
import { ProductCard } from "@/components/shop/product-card";
import { listProducts, getShopPriceBounds } from "@/server/services/catalog/products";
import { listCategoryTree } from "@/server/services/catalog/categories";
import {
  ancestorIdsOf,
  findNodeBySlug,
  flattenCategoryTree,
  pruneEmptyCategories,
  subtreeIdsOf,
  type CategoryNode,
} from "@/lib/catalog-tree";
import { buildShopHref, isPlainShopQuery, parseShopQuery } from "@/lib/shop-query";
import { ShopFacetSidebar } from "./shop-facet-sidebar";
import { ShopSearchBox } from "./shop-search-box";
import { ShopSortSelect } from "./shop-sort-select";
import { ShopActiveFilters } from "./shop-active-filters";
import { ShopEmptyState, type ShopEmptyKind } from "./shop-empty-state";

/**
 * T020 商城列表(/shop 旧路径不变 FR-109):RSC 直读服务层;
 * 分类筛选/排序/分页全为 URL 参数(可分享可回退);后台随时上下架/改价,列表禁静态化。
 * 筛选形态为「左栏分面 + 右侧结果」(2026-11-15 用户反馈:点了筛选项全是空的);
 * 分类语义为「单分类 + 父子聚合」——点父分类看到整棵子树的商品。
 */
export const dynamic = "force-dynamic";

export default async function ShopPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const query = parseShopQuery(searchParams);
  const [tree, bounds] = await Promise.all([listCategoryTree(), getShopPriceBounds()]);

  const flat = flattenCategoryTree(tree);
  const totalCount = flat.reduce((sum, node) => sum + node.ownCount, 0);
  const picked = query.categorySlugs.map((slug) => findNodeBySlug(tree, slug));
  const unknownCategory = picked.some((node) => node === null);
  const selectedNodes = picked.filter((node): node is CategoryNode => node !== null);
  const selectedCategories = selectedNodes.map((node) => ({ slug: node.slug, name: node.name }));
  // 只认解析成功的 slug:URL 里手写的未知分类不该被算成「已选」
  const selectedSlugs = selectedNodes.map((node) => node.slug);
  // 选中的父分类按子树筛选(单分类 + 父子聚合)
  const categoryIds = selectedNodes.flatMap((node) => subtreeIdsOf(tree, node.id));
  const defaultExpanded = [
    ...new Set(selectedNodes.flatMap((node) => [node.id, ...ancestorIdsOf(flat, node.id)])),
  ];

  const result = unknownCategory
    ? { items: [], page: 1, totalPages: 1, total: 0 }
    : await listProducts({
        categoryIds,
        q: query.keyword || undefined,
        minPrice: query.minPrice ?? undefined,
        maxPrice: query.maxPrice ?? undefined,
        sort: query.sort,
        page: query.page,
      });

  const activeFilterCount =
    selectedNodes.length +
    (query.keyword ? 1 : 0) +
    (query.minPrice !== null || query.maxPrice !== null ? 1 : 0);

  const clearHref = buildShopHref(query, {
    categorySlugs: [],
    keyword: null,
    minPrice: null,
    maxPrice: null,
    sort: null,
    page: 1,
  });

  let emptyKind: ShopEmptyKind = "no-match";
  if (result.total === 0) {
    const allSelectedEmpty =
      selectedNodes.length > 0 && selectedNodes.every((node) => node.subtreeCount === 0);
    emptyKind = allSelectedEmpty
      ? "category-empty"
      : isPlainShopQuery(query)
        ? "no-products"
        : "no-match";
  }

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <ContentPanel className="mx-auto flex max-w-6xl flex-col gap-5 p-4 lg:p-6">
        <header className="flex items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h1 className="text-[22px] font-bold leading-tight text-heading lg:text-[26px]">商城</h1>
            <p className="mt-1 text-[12.5px] text-muted">用积分兑换游戏道具与账号服务</p>
          </div>
          <Link
            href="/cart"
            data-testid="shop-cart-entry"
            className="inline-flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-sm text-body transition-colors hover:border-link hover:text-heading"
          >
            <ShoppingCart className="h-4 w-4" aria-hidden="true" />
            购物车
          </Link>
        </header>

        <div className="grid gap-5 lg:grid-cols-[266px_minmax(0,1fr)] lg:gap-6">
          <ShopFacetSidebar
            nodes={pruneEmptyCategories(tree)}
            selectedSlugs={selectedSlugs}
            query={query}
            defaultExpanded={defaultExpanded}
            bounds={bounds}
            activeFilterCount={activeFilterCount}
            totalCount={totalCount}
          />

          <section className="min-w-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <ShopSearchBox query={query} />
              <div className="flex items-center gap-2 rounded-xl border border-line bg-panel-inset px-3">
                <span className="text-[11px] tracking-wider text-muted">排序</span>
                <ShopSortSelect query={query} />
              </div>
              <div
                data-testid="shop-result-count"
                className="rounded-xl border border-line bg-panel px-3.5 py-2 text-[13px] text-muted"
              >
                共{" "}
                <span className="text-[16px] font-bold tabular-nums text-highlight">
                  {result.total}
                </span>{" "}
                件商品
              </div>
            </div>

            <ShopActiveFilters query={query} categories={selectedCategories} />

            {result.items.length === 0 ? (
              <ShopEmptyState
                kind={emptyKind}
                categoryLabel={selectedCategories[0]?.name}
                clearHref={clearHref}
              />
            ) : (
              <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
                {result.items.map((p) => (
                  <li key={p.id}>
                    <ProductCard
                      slug={p.slug}
                      name={p.name}
                      type={p.type}
                      image={p.image}
                      price={p.price}
                      effectivePrice={p.effectivePrice}
                      onSale={p.onSale}
                      categoryName={p.categoryName}
                    />
                  </li>
                ))}
              </ul>
            )}

            <PaginationNav
              page={result.page}
              totalPages={result.totalPages}
              href={(p) => buildShopHref(query, { page: p })}
              tone="shop"
            />
          </section>
        </div>
      </ContentPanel>
    </main>
  );
}
