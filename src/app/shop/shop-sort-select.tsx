"use client";

import { useRouter } from "next/navigation";
import { SHOP_SORT_OPTIONS } from "@/constants/shop";
import { buildShopHref, type ShopQuery } from "@/lib/shop-query";
import { useHydrated } from "@/lib/use-hydrated";
import { Select } from "@/components/ui/select";

/**
 * 商城排序下拉:切换即改 URL(排序进 URL ⇒ 可分享可回退)。
 * 水合门控(规则 30):水合完成前禁用,否则改动只落到 DOM 值、React 态不变,
 * 由状态派生的控件会恒 disabled 且页面看不出异常。
 */
export function ShopSortSelect({ query }: { query: ShopQuery }) {
  const router = useRouter();
  const hydrated = useHydrated();

  return (
    <Select
      value={query.sort}
      disabled={!hydrated}
      aria-label="排序方式"
      onChange={(e) => {
        const next = SHOP_SORT_OPTIONS.find((o) => o.value === e.target.value);
        if (!next) return;
        router.push(buildShopHref(query, { sort: next.value, page: 1 }));
      }}
      className="w-auto min-w-0 border-0 bg-transparent px-0 py-2.5 text-[13.5px] focus-visible:ring-2"
    >
      {SHOP_SORT_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}
