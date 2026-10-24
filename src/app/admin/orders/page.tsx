import Link from "next/link";
import { listAdminOrders } from "@/server/services/orders/admin";
import { ORDER_STATUS, ORDER_STATUS_LABEL } from "@/constants/shop";

/**
 * 订单列表(FR-129):状态筛选+分页;delivery_failed 由布局导航标记(FR-128)。
 */
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "全部" },
  ...Object.values(ORDER_STATUS).map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
];

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-gray-800 text-gray-300",
  paid: "bg-amber-950 text-amber-400",
  delivering: "bg-blue-950 text-blue-400",
  completed: "bg-green-950 text-green-400",
  delivery_failed: "bg-red-950 text-red-400",
  cancelled: "bg-gray-800 text-gray-400",
  refunded: "bg-gray-800 text-gray-400",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const status = searchParams.status ?? "";
  const { orders, totalPages, total } = await listAdminOrders({
    status: status || undefined,
    page,
  });

  const pageHref = (p: number) =>
    `/admin/orders?page=${p}${status ? `&status=${status}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">订单</h1>
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={f.value ? `/admin/orders?status=${f.value}` : "/admin/orders"}
            className={`rounded border px-3 py-1 ${
              status === f.value
                ? "border-blue-600 bg-blue-950 text-blue-300"
                : "border-gray-700 text-gray-300 hover:bg-gray-800"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          没有符合条件的订单。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">订单号</th>
              <th className="py-2 pr-3 font-normal">用户</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">件数</th>
              <th className="py-2 pr-3 font-normal">积分</th>
              <th className="py-2 pr-3 font-normal">时间</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-gray-900">
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-mono text-xs text-blue-400 hover:underline"
                  >
                    {o.orderNo}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-gray-300">{o.username}</td>
                <td className="py-2 pr-3">
                  <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? "bg-gray-800 text-gray-300"}`}>
                    {ORDER_STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-400">{o.itemCount}</td>
                <td className="py-2 pr-3 text-amber-400">{o.pointCost}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">
                  {new Date(o.createdAt).toLocaleString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 单</span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-4">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-blue-400 hover:underline">
                上一页
              </Link>
            ) : (
              <span className="text-gray-600">上一页</span>
            )}
            <span>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-blue-400 hover:underline">
                下一页
              </Link>
            ) : (
              <span className="text-gray-600">下一页</span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
