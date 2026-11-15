import Link from "next/link";
import { SHOP_PRICE_PRESETS, SHOP_QUERY_PARAM } from "@/constants/shop";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";

/**
 * 价格分面:两个输入框(手输区间)+ 预设档(快捷链接)。
 * 输入框走 GET 表单(回车即生效,无 JS 也能用);表单只带「本分面之外」的筛选参数,
 * 改价格不会把分类/关键词/排序弄丢。计数提示取全站在售商品的生效价区间。
 */
export function ShopPriceFacet({
  query,
  bounds,
}: {
  query: ShopQuery;
  bounds: { min: number | null; max: number | null };
}) {
  return (
    <div className="space-y-2.5">
      <form method="get" action="/shop" className="flex items-center gap-2">
        {query.categorySlugs.length > 0 ? (
          <input
            type="hidden"
            name={SHOP_QUERY_PARAM.category}
            value={query.categorySlugs.join(",")}
          />
        ) : null}
        {query.keyword ? (
          <input type="hidden" name={SHOP_QUERY_PARAM.keyword} value={query.keyword} />
        ) : null}
        <input type="hidden" name={SHOP_QUERY_PARAM.sort} value={query.sort} />

        <label className="flex-1">
          <span className="sr-only">最低价(积分)</span>
          <input
            type="number"
            name={SHOP_QUERY_PARAM.minPrice}
            min={0}
            inputMode="numeric"
            defaultValue={query.minPrice ?? ""}
            placeholder="最低"
            className="w-full rounded-lg border border-line bg-panel-inset px-2.5 py-2 text-[13px] text-foreground outline-none transition-shadow focus:border-highlight/60 focus:ring-2 focus:ring-highlight/20"
          />
        </label>
        <span className="text-xs text-muted" aria-hidden="true">
          —
        </span>
        <label className="flex-1">
          <span className="sr-only">最高价(积分)</span>
          <input
            type="number"
            name={SHOP_QUERY_PARAM.maxPrice}
            min={0}
            inputMode="numeric"
            defaultValue={query.maxPrice ?? ""}
            placeholder="最高"
            className="w-full rounded-lg border border-line bg-panel-inset px-2.5 py-2 text-[13px] text-foreground outline-none transition-shadow focus:border-highlight/60 focus:ring-2 focus:ring-highlight/20"
          />
        </label>
        <button
          type="submit"
          className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-2 text-[12.5px] text-body transition-colors hover:border-link hover:text-heading"
        >
          应用
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {SHOP_PRICE_PRESETS.map((preset) => {
          const active = query.minPrice === preset.min && query.maxPrice === preset.max;
          return (
            <Link
              key={preset.label}
              href={buildShopHref(query, {
                minPrice: preset.min,
                maxPrice: preset.max,
                page: 1,
              })}
              aria-current={active ? "true" : undefined}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-highlight/55 bg-highlight/15 text-highlight-strong"
                  : "border-line bg-chip text-body hover:border-highlight/55 hover:text-highlight-strong"
              }`}
            >
              {preset.label}
            </Link>
          );
        })}
      </div>

      {bounds.min !== null && bounds.max !== null ? (
        <p className="text-[11.5px] text-muted">
          在售商品价格区间{" "}
          <span className="font-semibold text-highlight">
            {bounds.min} – {bounds.max}
          </span>{" "}
          积分
        </p>
      ) : null}
    </div>
  );
}
