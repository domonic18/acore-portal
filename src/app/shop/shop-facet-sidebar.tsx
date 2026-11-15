"use client";

import Link from "next/link";
import { Filter, ChevronDown } from "lucide-react";
import { useState } from "react";
import type { CategoryNode } from "@/lib/catalog-tree";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";
import { ShopFacetTree } from "./shop-facet-tree";
import { ShopPriceFacet } from "./shop-price-facet";

/**
 * 商城分面侧栏(窄屏折叠 / 宽屏常驻):
 * - 分类树 + 价格区间 + 清除筛选三块;
 * - 窄屏收成一条「筛选」栏(点开展开),宽屏常驻左栏并吸顶;
 * - 分面内容全部进 URL(树节点是链接),可分享可回退。
 */
export function ShopFacetSidebar({
  nodes,
  selectedSlugs,
  query,
  defaultExpanded,
  bounds,
  activeFilterCount,
  totalCount,
}: {
  nodes: CategoryNode[];
  selectedSlugs: string[];
  query: ShopQuery;
  defaultExpanded: string[];
  bounds: { min: number | null; max: number | null };
  activeFilterCount: number;
  totalCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <aside className="lg:sticky lg:top-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="shop-facet-panels"
        className="mb-3 flex w-full items-center justify-between rounded-xl border border-line bg-panel px-4 py-3 text-sm text-heading lg:hidden"
      >
        <span className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-link" aria-hidden="true" />
          筛选
          {activeFilterCount > 0 ? (
            <span className="rounded-full bg-link px-2 py-0.5 text-[11px] font-semibold text-ink">
              {activeFilterCount}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div
        id="shop-facet-panels"
        className={`${open ? "block" : "hidden"} space-y-3 lg:block`}
      >
        <section className="overflow-hidden rounded-xl border border-line bg-panel">
          <header className="flex items-center gap-2 border-b border-line bg-panel-hover/40 px-4 py-3">
            <span className="h-4 w-1 rounded-sm bg-link" aria-hidden="true" />
            <h2 className="text-[14px] font-semibold text-heading">分类</h2>
            <span className="ml-auto text-[11.5px] text-muted">
              {selectedSlugs.length > 0 ? `已选 ${selectedSlugs.length} 项` : "全部"}
            </span>
          </header>
          <div className="p-2">
            <Link
              href={buildShopHref(query, { categorySlugs: [], page: 1 })}
              className={`mb-1 flex items-center gap-2 rounded-lg border border-dashed border-link/30 bg-link/5 px-3 py-2 text-[13.5px] transition-colors hover:border-link hover:text-heading ${
                selectedSlugs.length === 0 ? "text-heading" : "text-body"
              }`}
            >
              <span className="flex-1 truncate">全部商品</span>
              <span className="text-[11.5px] tabular-nums text-muted">{totalCount}</span>
            </Link>
            <ShopFacetTree
              nodes={nodes}
              selectedSlugs={selectedSlugs}
              query={query}
              defaultExpanded={defaultExpanded}
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-line bg-panel">
          <header className="flex items-center gap-2 border-b border-line bg-panel-hover/40 px-4 py-3">
            <span className="h-4 w-1 rounded-sm bg-highlight" aria-hidden="true" />
            <h2 className="text-[14px] font-semibold text-heading">价格区间</h2>
          </header>
          <div className="p-3">
            <ShopPriceFacet query={query} bounds={bounds} />
          </div>
        </section>

        {activeFilterCount > 0 ? (
          <Link
            href={buildShopHref(query, {
              categorySlugs: [],
              keyword: null,
              minPrice: null,
              maxPrice: null,
              sort: null,
              page: 1,
            })}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-danger/25 bg-danger/5 px-3 py-2.5 text-[13px] text-danger transition-colors hover:border-danger/50 hover:bg-danger/10"
          >
            清除全部筛选
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
