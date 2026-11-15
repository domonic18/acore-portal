import Link from "next/link";
import { PackageOpen, SearchX, Package } from "lucide-react";

/**
 * 商城列表空态(三态):
 * - no-products:店里一件在售商品都没有(不是筛选造成的);
 * - no-match:有筛选但没匹配上(关键词/价格/分类组合可能互相打架);
 * - category-empty:选中的分类本身没有上架商品(草稿不算数)。
 * 三态文案与出路不同,混成一句「暂无商品」会让用户以为是站点坏了。
 */
export type ShopEmptyKind = "no-products" | "no-match" | "category-empty";

export function ShopEmptyState({
  kind,
  categoryLabel,
  clearHref = "/shop",
}: {
  kind: ShopEmptyKind;
  categoryLabel?: string;
  clearHref?: string;
}) {
  if (kind === "category-empty") {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel/60 px-6 py-14 text-center">
        <Package className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <h3 className="mt-3 text-[15px] font-semibold text-heading">
          「{categoryLabel ?? "该分类"}」暂无上架商品
        </h3>
        <p className="mt-1.5 text-[13px] text-muted">
          该分类下的商品目前都还未上架,上架后即可在此选购。
        </p>
        <Link
          href={clearHref}
          className="mt-5 inline-block rounded-lg bg-highlight-deep px-5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-highlight-deep-hover"
        >
          返回全部商品
        </Link>
      </div>
    );
  }

  if (kind === "no-match") {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel/60 px-6 py-14 text-center">
        <SearchX className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
        <h3 className="mt-3 text-[15px] font-semibold text-heading">没有匹配的商品</h3>
        <p className="mt-1.5 text-[13px] text-muted">
          换个关键词或放宽价格区间试试,也可以直接清除全部筛选。
        </p>
        <Link
          href={clearHref}
          className="mt-5 inline-block rounded-lg bg-highlight-deep px-5 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-highlight-deep-hover"
        >
          清除全部筛选
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-dashed border-line bg-panel/60 px-6 py-14 text-center">
      <PackageOpen className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
      <h3 className="mt-3 text-[15px] font-semibold text-heading">暂时没有在售商品</h3>
      <p className="mt-1.5 text-[13px] text-muted">商品上架后会显示在这里。</p>
    </div>
  );
}
