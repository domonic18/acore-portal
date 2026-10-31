import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/session-guard";
import { getOrderDetail } from "@/server/services/orders/queries";
import {
  DELIVERY_STATUS_LABEL,
  ORDER_STATUS_LABEL,
} from "@/constants/shop";
import { OrderStatusPoll } from "@/components/shop/order-status-poll";

/**
 * T035 订单详情(FR-117):条目快照/金额/状态/发货结果/下单参数;
 * 归属过滤 null → notFound(404 防枚举);发货态挂 30s 轮询。
 */

const DELIVERY_BADGE: Record<string, string> = {
  pending: "bg-gray-800 text-gray-300",
  delivered: "bg-green-950 text-green-400",
  failed: "bg-red-950 text-red-400",
};

function fmtParam(value: unknown): string {
  return typeof value === "object" && value !== null
    ? JSON.stringify(value)
    : String(value);
}

export default async function OrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await requireSession();
  const numericId = Number(params.id);
  const order =
    Number.isSafeInteger(numericId) && numericId > 0
      ? await getOrderDetail(BigInt(session.userId), BigInt(numericId))
      : null;
  if (!order) notFound();

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-800 pb-3">
        <h1 className="text-2xl font-bold">订单详情</h1>
        <span className="font-mono text-sm text-gray-400">{order.orderNo}</span>
        <OrderStatusPoll status={order.status} />
      </header>

      <section className="flex flex-wrap items-center gap-4 rounded border border-gray-800 p-4 text-sm">
        <span className="rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-200">
          {ORDER_STATUS_LABEL[order.status] ?? order.status}
        </span>
        <span>
          支付:<span className="font-semibold text-amber-400">{order.pointCost} 积分</span>
        </span>
        <span className="text-gray-500">下单:{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
        {order.completedAt && (
          <span className="text-gray-500">
            完成:{new Date(order.completedAt).toLocaleString("zh-CN")}
          </span>
        )}
        {order.deliveryError && (
          <p className="w-full text-sm text-red-400">发货异常:{order.deliveryError}</p>
        )}
      </section>

      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-4 rounded border border-gray-800 p-4">
            <div className="flex min-w-48 flex-1 flex-col gap-1">
              <span className="font-semibold">{item.name}</span>
              <span className="font-mono text-xs text-gray-500">{item.sku}</span>
              <span className="text-xs text-gray-400">
                {Object.entries((item.params ?? {}) as Record<string, unknown>)
                  .map(([k, v]) => fmtParam(v))
                  .join(" · ")}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1 text-sm">
              <span>
                {item.unitPrice} × {item.qty}
              </span>
              <span className={`rounded px-2 py-0.5 text-xs ${DELIVERY_BADGE[item.deliveryStatus] ?? "bg-gray-800"}`}>
                {DELIVERY_STATUS_LABEL[item.deliveryStatus] ?? item.deliveryStatus}
              </span>
              {item.deliveredAt && (
                <span className="text-xs text-gray-500">
                  {new Date(item.deliveredAt).toLocaleString("zh-CN")}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <Link href="/account/orders" className="text-sm text-gray-300 hover:text-white">
        ← 返回订单列表
      </Link>
    </main>
  );
}
