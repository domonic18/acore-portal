import Link from "next/link";
import { listMigrationReviews } from "@/server/services/orders/admin";
import { ORDER_STATUS_LABEL, type OrderStatusValue } from "@/constants/shop";
import { ReviewActions } from "@/components/admin/review-actions";

/**
 * D3 复核清单(T062;api-admin 契约):扣分与金额不符的存量单,
 * 记录两口径(paid vs expected);通过→completed/驳回→cancelled,审计留痕。
 */
const FILTERS: { value: string; label: string }[] = [
  { value: "0", label: "待复核" },
  { value: "1", label: "已落定" },
  { value: "all", label: "全部" },
];

export default async function AdminReviewItemsPage({
  searchParams,
}: {
  searchParams: { resolved?: string; page?: string };
}) {
  const resolved = ["0", "1", "all"].includes(searchParams.resolved ?? "")
    ? (searchParams.resolved as "0" | "1" | "all")
    : "0";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, totalPages, total } = await listMigrationReviews({ resolved, page });

  const pageHref = (p: number) => `/admin/review-items?resolved=${resolved}&page=${p}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">迁移复核</h1>
        <span className="text-xs text-gray-500">共 {total} 项</span>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/review-items?resolved=${f.value}`}
            className={`rounded border px-3 py-1 ${
              resolved === f.value
                ? "border-blue-600 bg-blue-950 text-blue-300"
                : "border-gray-700 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          没有待处理的复核项。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">WP 单号</th>
              <th className="py-2 pr-3 font-normal">新站订单</th>
              <th className="py-2 pr-3 font-normal">用户</th>
              <th className="py-2 pr-3 font-normal">差异(实扣/应扣)</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">复核</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => {
              const detail = r.detail as { paid?: number; expected?: number } | null;
              return (
                <tr key={r.id} className="border-b border-gray-900 align-middle">
                  <td className="py-2 pr-3 font-mono text-xs">WP{r.legacyWpOrderId}</td>
                  <td className="py-2 pr-3">
                    {r.orderNo ? (
                      <span className="font-mono text-xs">{r.orderNo}</span>
                    ) : (
                      <span className="text-xs text-gray-500">无订单行</span>
                    )}
                    {r.pointCost !== null && (
                      <span className="ml-2 text-xs text-gray-400">{r.pointCost} 积分</span>
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs">{r.username ?? "-"}</td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {detail?.paid ?? "?"} / {detail?.expected ?? "?"}
                  </td>
                  <td className="py-2 pr-3">
                    {r.resolvedAt ? (
                      <span className="text-xs text-gray-400">
                        已落定 {new Date(r.resolvedAt).toLocaleDateString("zh-CN")}
                      </span>
                    ) : (
                      <span className="rounded bg-amber-900/60 px-2 py-0.5 text-xs text-amber-300">
                        待复核
                      </span>
                    )}
                    {r.orderStatus && (
                      <span className="ml-2 text-xs text-gray-500">
                        单={ORDER_STATUS_LABEL[r.orderStatus as OrderStatusValue] ?? r.orderStatus}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.resolvedAt ? (
                      <span className="text-xs text-gray-600">-</span>
                    ) : (
                      <ReviewActions reviewId={r.id} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {totalPages > 1 && (
        <nav className="flex items-center gap-3 text-sm text-gray-400">
          {page > 1 && (
            <Link href={pageHref(page - 1)} className="hover:text-white">
              上一页
            </Link>
          )}
          <span>
            {page} / {totalPages}
          </span>
          {page < totalPages && (
            <Link href={pageHref(page + 1)} className="hover:text-white">
              下一页
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
