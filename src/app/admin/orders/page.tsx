import Link from "next/link";
import { listAdminOrders } from "@/server/services/orders/admin";
import { ORDER_STATUS, ORDER_STATUS_LABEL, ORDER_STATUS_TONE } from "@/constants/shop";
import { AdminPager } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { buildPageHref } from "@/lib/pagination";
import { formatDateTime } from "@/lib/format";

/**
 * 订单列表(FR-129):状态筛选+分页;delivery_failed 由布局导航标记(FR-128)。
 */
const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "全部" },
  ...Object.values(ORDER_STATUS).map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] })),
];

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
    buildPageHref("/admin/orders", { status: status || undefined }, p);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">订单</h1>
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => {
          const active = status === f.value;
          return (
            <Link
              key={f.value}
              prefetch={false}
              href={f.value ? `/admin/orders?status=${f.value}` : "/admin/orders"}
              className={`rounded-md px-3 py-1 text-[13px] transition ${FOCUS_RING} ${
                active
                  ? "border border-[#6fb7e0]/50 bg-[#6fb7e0]/10 text-[#a8d9f5]"
                  : "border border-transparent text-[#93b2ce] hover:bg-[#13233a] hover:text-[#dcebf7]"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {orders.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          没有符合条件的订单。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>订单号</Th>
              <Th>用户</Th>
              <Th>状态</Th>
              <Th>件数</Th>
              <Th>积分</Th>
              <Th>时间</Th>
            </tr>
          </THead>
          <tbody>
            {orders.map((o) => (
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
                <Td className="text-[#dcebf7]">
                  {o.username}
                  {o.characterNames.length > 0 && (
                    <span className="ml-1 text-xs text-[#6482a3]">
                      （{o.characterNames.join("、")}）
                    </span>
                  )}
                </Td>
                <Td>
                  <Badge
                    tone={
                      ORDER_STATUS_TONE[o.status as keyof typeof ORDER_STATUS_TONE] ?? "muted"
                    }
                  >
                    {ORDER_STATUS_LABEL[o.status as keyof typeof ORDER_STATUS_LABEL] ?? o.status}
                  </Badge>
                </Td>
                <Td className="text-[#93b2ce]">{o.itemCount}</Td>
                <Td className="font-medium text-[#e8c877]">{o.pointCost}</Td>
                <Td className="whitespace-nowrap text-xs text-[#6482a3]">
                  {formatDateTime(o.createdAt)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="单"
        href={pageHref}
      />
    </div>
  );
}
