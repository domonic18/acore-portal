import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminOrderDetail } from "@/server/services/orders/admin";
import {
  DELIVERY_STATUS_LABEL,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_TONE,
} from "@/constants/shop";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { OrderActions } from "@/components/admin/order-actions";
import { displayUserName } from "@/lib/format";

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
        <h1 className="font-mono text-2xl font-bold text-[#dcebf7]">{order.orderNo}</h1>
        <Badge tone={ORDER_STATUS_TONE[status] ?? "muted"} className="text-[13px]">
          {ORDER_STATUS_LABEL[status] ?? order.status}
        </Badge>
        <span className="text-sm font-medium text-[#e8c877]">{order.pointCost} 积分</span>
        <Link
          href="/admin/orders"
          className="rounded text-sm text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
        >
          ← 返回列表
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-[#22385a] bg-[#13233a] p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-[#6482a3]">用户</dt>
          <dd>
            <Link
              href={`/admin/users/${order.user.id}`}
              className="rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
            >
              {displayUserName(order.user)}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">邮箱</dt>
          <dd className="text-[#dcebf7]">{order.user.email}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">下单时间</dt>
          <dd className="text-[#dcebf7]">{new Date(order.createdAt).toLocaleString("zh-CN")}</dd>
        </div>
        {order.legacyWpOrderId != null && (
          <div>
            <dt className="text-[#6482a3]">WP 存量单号</dt>
            <dd className="font-mono text-[#dcebf7]">#{order.legacyWpOrderId}</dd>
          </div>
        )}
      </dl>

      <OrderActions orderId={order.id.toString()} status={order.status} />

      <Table>
        <THead>
          <tr>
            <Th>商品</Th>
            <Th>SKU</Th>
            <Th>单价</Th>
            <Th>数量</Th>
            <Th>发货状态</Th>
          </tr>
        </THead>
        <tbody>
          {order.items.map((item) => (
            <Tr key={item.id}>
              <Td>
                {item.name}
                <span className="mt-0.5 block whitespace-nowrap text-xs text-[#6482a3]">
                  /shop/{item.product.slug}
                </span>
              </Td>
              <Td className="font-mono text-xs text-[#93b2ce]">{item.sku}</Td>
              <Td className="text-[#dcebf7]">{item.unitPrice}</Td>
              <Td className="text-[#dcebf7]">{item.qty}</Td>
              <Td>
                <Badge
                  tone={
                    item.deliveryStatus === "delivered"
                      ? "ok"
                      : item.deliveryStatus === "failed"
                        ? "danger"
                        : "muted"
                  }
                >
                  {DELIVERY_STATUS_LABEL[item.deliveryStatus] ?? item.deliveryStatus}
                </Badge>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
