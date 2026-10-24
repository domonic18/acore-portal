import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminOrderDetail } from "@/server/services/orders/admin";
import {
  DELIVERY_STATUS_LABEL,
  ORDER_STATUS_LABEL,
} from "@/constants/shop";
import { OrderActions } from "@/components/admin/order-actions";

/**
 * 订单详情(FR-129):行级发货状态+补发/退款入口;用户名链到用户详情。
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const order = await getAdminOrderDetail(BigInt(id));
  if (!order) notFound();

  const status = order.status as keyof typeof ORDER_STATUS_LABEL;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-mono text-2xl font-bold">{order.orderNo}</h1>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-sm text-gray-300">
          {ORDER_STATUS_LABEL[status] ?? order.status}
        </span>
        <span className="text-sm text-amber-400">{order.pointCost} 积分</span>
        <Link href="/admin/orders" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded border border-gray-800 p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-gray-500">用户</dt>
          <dd>
            <Link href={`/admin/users/${order.user.id}`} className="text-blue-400 hover:underline">
              {order.user.username}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-gray-500">邮箱</dt>
          <dd className="text-gray-300">{order.user.email}</dd>
        </div>
        <div>
          <dt className="text-gray-500">下单时间</dt>
          <dd className="text-gray-300">{new Date(order.createdAt).toLocaleString("zh-CN")}</dd>
        </div>
        {order.legacyWpOrderId != null && (
          <div>
            <dt className="text-gray-500">WP 存量单号</dt>
            <dd className="font-mono text-gray-300">#{order.legacyWpOrderId}</dd>
          </div>
        )}
      </dl>

      <OrderActions orderId={order.id.toString()} status={order.status} />

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400">
            <th className="py-2 pr-3 font-normal">商品</th>
            <th className="py-2 pr-3 font-normal">SKU</th>
            <th className="py-2 pr-3 font-normal">单价</th>
            <th className="py-2 pr-3 font-normal">数量</th>
            <th className="py-2 pr-3 font-normal">发货状态</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((item) => (
            <tr key={item.id} className="border-b border-gray-900">
              <td className="py-2 pr-3 text-gray-200">
                {item.name}
                <span className="ml-2 text-xs text-gray-500">
                  /shop/{item.product.slug}
                </span>
              </td>
              <td className="py-2 pr-3 font-mono text-xs text-gray-400">{item.sku}</td>
              <td className="py-2 pr-3 text-gray-300">{item.unitPrice}</td>
              <td className="py-2 pr-3 text-gray-300">{item.qty}</td>
              <td className="py-2 pr-3">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    item.deliveryStatus === "delivered"
                      ? "bg-green-950 text-green-400"
                      : item.deliveryStatus === "failed"
                        ? "bg-red-950 text-red-400"
                        : "bg-gray-800 text-gray-400"
                  }`}
                >
                  {DELIVERY_STATUS_LABEL[item.deliveryStatus] ?? item.deliveryStatus}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
