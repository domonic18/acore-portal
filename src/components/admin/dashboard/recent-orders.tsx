import Link from "next/link";
import { ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/constants/shop";
import { displayUserName } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";

type RecentOrder = {
  id: string;
  orderNo: string;
  username: string;
  nickname: string | null;
  status: string;
  pointCost: number;
  itemCount: number;
  createdAt: string;
};

/** 仪表盘最新订单表(只读;整单跳后台订单详情) */
export function DashboardRecentOrders({ orders }: { orders: RecentOrder[] }) {
  return (
    <Table>
      <THead>
        <tr>
          <Th className="w-[170px]">订单号</Th>
          <Th>用户</Th>
          <Th className="w-[90px]">件数</Th>
          <Th className="w-[90px]">积分</Th>
          <Th className="w-[96px]">状态</Th>
          <Th className="w-[160px]">时间</Th>
        </tr>
      </THead>
      <tbody>
        {orders.length === 0 ? (
          <TableEmpty colSpan={6} label="暂无订单" />
        ) : (
          orders.map((o) => (
            <Tr key={o.id}>
              <Td>
                <Link
                  prefetch={false}
                  href={`/admin/orders/${o.id}`}
                  className="rounded font-mono text-xs text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
                >
                  {o.orderNo}
                </Link>
              </Td>
              <Td className="text-[#c4d9ec]">{displayUserName(o)}</Td>
              <Td className="text-[#93b2ce]">{o.itemCount}</Td>
              <Td className="font-medium text-[#e8c877]">{o.pointCost}</Td>
              <Td>
                <Badge tone={ORDER_STATUS_TONE[o.status as keyof typeof ORDER_STATUS_TONE] ?? "muted"}>
                  {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}
                </Badge>
              </Td>
              <Td className="text-xs text-[#6482a3]">
                {new Date(o.createdAt).toLocaleString("zh-CN")}
              </Td>
            </Tr>
          ))
        )}
      </tbody>
    </Table>
  );
}
