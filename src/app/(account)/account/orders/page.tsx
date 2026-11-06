import Link from "next/link";
import { requireSession } from "@/server/session-guard";
import { listOrders } from "@/server/services/orders/queries";
import { ORDER_STATUS_LABEL } from "@/constants/shop";
import { PaginationNav } from "@/components/ui/pagination";
import { buildPageHref } from "@/lib/pagination";

/**
 * T035 订单列表(FR-117):分页(服务端 RSC 链接翻页)+状态徽标;最新在前。
 */

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-line text-foreground",
  paid: "bg-amber-950 text-amber-400",
  delivering: "bg-panel text-link",
  completed: "bg-green-950 text-green-400",
  delivery_failed: "bg-red-950 text-red-400",
  cancelled: "bg-line text-body",
  refunded: "bg-line text-body",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const session = await requireSession();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { orders, totalPages } = await listOrders(BigInt(session.userId), page);

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">订单</h1>

      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-line px-6 py-12 text-center">
          <p className="text-foreground">暂无订单</p>
          <p className="text-sm text-muted">
            去<Link href="/shop" className="mx-1 underline">商城</Link>逛逛吧。
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3">
            {orders.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-4">
                <Link
                  href={`/account/orders/${o.id}`}
                  className="font-mono text-sm text-link hover:underline"
                >
                  {o.orderNo}
                </Link>
                <span className={`rounded px-2 py-0.5 text-xs ${STATUS_BADGE[o.status] ?? "bg-line text-foreground"}`}>
                  {ORDER_STATUS_LABEL[o.status] ?? o.status}
                </span>
                <span className="text-xs text-muted">
                  {o.itemCount} 件 · {new Date(o.createdAt).toLocaleString("zh-CN")}
                </span>
                <span className="ml-auto font-semibold text-amber-400">{o.pointCost} 积分</span>
              </li>
            ))}
          </ul>
          <PaginationNav
            page={page}
            totalPages={totalPages}
            href={(p) => buildPageHref("/account/orders", {}, p)}
            tone="account"
          />
        </>
      )}
    </main>
  );
}
