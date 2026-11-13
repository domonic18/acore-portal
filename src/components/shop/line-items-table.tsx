import Link from "next/link";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";
import { CartLineControls } from "@/components/shop/cart-line-controls";

/**
 * 购物车/结算页行项表(#154):
 * 参照 WP 旧站口径给出「产品/价格/数量/小计」四列表头,列含义一目了然;
 * 购物车行数量可改(带增减/移除控件),结算页行只读。
 */

export type LineItemRow = {
  id: string;
  name: string;
  slug: string;
  sku: string;
  image: string | null;
  unitPrice: number;
  qty: number;
  subtotal: number;
  onSale: boolean;
  soldOut: boolean;
  published: boolean;
  params: { characterGuid?: number; restoreItemEntry?: number; unlockName?: string };
};

const PARAM_LABEL: Record<string, string> = {
  characterGuid: "角色",
  restoreItemEntry: "恢复物品",
  unlockName: "目标名字",
};

function paramDisplay(key: string, value: unknown, guidNames: Map<number, string>): string {
  const label = PARAM_LABEL[key] ?? key;
  if (key === "characterGuid" && typeof value === "number") {
    return `${label}:${guidNames.get(value) ?? `#${value}`}`;
  }
  if (key === "restoreItemEntry" && typeof value === "number") {
    return `${label}:#${value}`;
  }
  return `${label}:${String(value)}`;
}

export function LineItemsTable({
  rows,
  guidNames,
  editable = false,
}: {
  rows: LineItemRow[];
  guidNames: Map<number, string>;
  editable?: boolean;
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-line text-xs text-muted">
            <th scope="col" className="px-3 py-2 text-left font-medium">
              产品
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              价格
            </th>
            <th scope="col" className="px-3 py-2 text-center font-medium">
              数量
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              小计
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const params = Object.entries(row.params)
              .map(([k, v]) => paramDisplay(k, v, guidNames))
              .join(" · ");
            return (
              <tr key={row.id} className="border-b border-line/60 align-top">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    {row.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={row.image}
                        alt={row.name}
                        loading="lazy"
                        draggable={false}
                        className="h-12 w-12 shrink-0 rounded bg-panel-inset object-contain"
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-panel-inset text-xl"
                      >
                        {row.sku.startsWith(ITEMSEND_SKU_PREFIX) ? "⚔" : "🛠"}
                      </div>
                    )}
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                      <Link
                        href={`/shop/${row.slug}`}
                        className="font-semibold text-heading hover:text-link"
                      >
                        {row.name}
                      </Link>
                      <span className="text-xs text-muted">{params}</span>
                      <span className="flex gap-2 text-xs">
                        {row.onSale && <span className="text-red-400">促销中</span>}
                        {row.soldOut && <span className="text-red-400">已售罄</span>}
                        {!row.published && <span className="text-highlight">已下架</span>}
                      </span>
                    </div>
                  </div>
                </td>
                <td
                  className={`px-3 py-3 text-right ${row.onSale ? "font-semibold text-highlight" : "text-body"}`}
                >
                  {row.unitPrice}
                </td>
                <td className="px-3 py-3 text-center">
                  {editable ? (
                    <CartLineControls itemId={row.id} qty={row.qty} soldOut={row.soldOut} />
                  ) : (
                    <span aria-label="数量" className="text-body">
                      {row.qty}
                    </span>
                  )}
                </td>
                <td
                  data-testid="line-subtotal"
                  className="px-3 py-3 text-right font-semibold text-heading"
                >
                  {row.subtotal}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
