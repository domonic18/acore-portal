import { Search } from "lucide-react";
import { SHOP_QUERY_PARAM } from "@/constants/shop";
import type { ShopQuery } from "@/lib/shop-query";

/**
 * 商城搜索框:GET 表单(回车即生效,无 JS 也可用)。
 * 表单只带「本搜索之外」的筛选参数,改关键词不会把分类/价格/排序弄丢。
 */
export function ShopSearchBox({ query }: { query: ShopQuery }) {
  return (
    <form
      method="get"
      action="/shop"
      role="search"
      className="flex basis-full min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-panel-inset px-3 transition-shadow focus-within:border-link/60 focus-within:ring-2 focus-within:ring-link/15 sm:basis-0"
    >
      <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
      {query.categorySlugs.length > 0 ? (
        <input
          type="hidden"
          name={SHOP_QUERY_PARAM.category}
          value={query.categorySlugs.join(",")}
        />
      ) : null}
      {query.minPrice !== null ? (
        <input type="hidden" name={SHOP_QUERY_PARAM.minPrice} value={String(query.minPrice)} />
      ) : null}
      {query.maxPrice !== null ? (
        <input type="hidden" name={SHOP_QUERY_PARAM.maxPrice} value={String(query.maxPrice)} />
      ) : null}
      <input type="hidden" name={SHOP_QUERY_PARAM.sort} value={query.sort} />
      <input
        type="search"
        name={SHOP_QUERY_PARAM.keyword}
        defaultValue={query.keyword}
        placeholder="搜索商品名…"
        aria-label="搜索商品"
        className="min-w-0 flex-1 bg-transparent py-2.5 text-[13.5px] text-foreground outline-none placeholder:text-muted"
      />
      <button type="submit" className="sr-only">
        搜索
      </button>
    </form>
  );
}
