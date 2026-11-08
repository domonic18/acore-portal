import Link from "next/link";
import { listMigrationReviews } from "@/server/services/orders/admin";
import { ORDER_STATUS_LABEL, type OrderStatusValue } from "@/constants/shop";
import { ReviewActions } from "@/components/admin/review-actions";
import { Badge } from "@/components/ui/badge";
import { PaginationNav } from "@/components/ui/pagination";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { displayUserName } from "@/lib/format";
import { buildPageHref } from "@/lib/pagination";

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

  const pageHref = (p: number) => buildPageHref("/admin/review-items", { resolved }, p);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-bold">迁移复核</h1>
        <span className="text-xs text-[#6482a3]">共 {total} 项</span>
      </div>
      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map((f) => {
          const active = resolved === f.value;
          return (
            <Link
              key={f.value}
              prefetch={false}
              href={`/admin/review-items?resolved=${f.value}`}
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

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          没有待处理的复核项。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>WP 单号</Th>
              <Th>新站订单</Th>
              <Th>用户</Th>
              <Th>差异(实扣/应扣)</Th>
              <Th>状态</Th>
              <Th>复核</Th>
            </tr>
          </THead>
          <tbody>
            {items.map((r) => {
              const detail = r.detail as { paid?: number; expected?: number } | null;
              return (
                  <Tr key={r.id} className="align-middle">
                    <Td className="font-mono text-xs">WP{r.legacyWpOrderId}</Td>
                    <Td>
                      {r.orderNo ? (
                        <span className="font-mono text-xs">{r.orderNo}</span>
                      ) : (
                        <span className="text-xs text-[#6482a3]">无订单行</span>
                      )}
                      {r.pointCost !== null && (
                        <span className="ml-2 text-xs text-[#93b2ce]">{r.pointCost} 积分</span>
                      )}
                    </Td>
                    <Td className="text-xs">
                      {r.username ? displayUserName(r) : "-"}
                    </Td>
                    <Td className="font-mono text-xs">
                      {detail?.paid ?? "?"} / {detail?.expected ?? "?"}
                    </Td>
                    <Td>
                      {r.resolvedAt ? (
                        <span className="text-xs text-[#93b2ce]">
                          已落定 {new Date(r.resolvedAt).toLocaleDateString("zh-CN")}
                        </span>
                      ) : (
                        <Badge tone="warn">待复核</Badge>
                      )}
                      {r.orderStatus && (
                        <span className="ml-2 text-xs text-[#6482a3]">
                          单={ORDER_STATUS_LABEL[r.orderStatus as OrderStatusValue] ?? r.orderStatus}
                        </span>
                      )}
                    </Td>
                    <Td>
                      {r.resolvedAt ? (
                        <span className="text-xs text-[#6482a3]">-</span>
                      ) : (
                        <ReviewActions reviewId={r.id} />
                      )}
                    </Td>
                  </Tr>
                );
              })
            }
          </tbody>
        </Table>
      )}

      <PaginationNav page={page} totalPages={totalPages} href={pageHref} tone="compact" />
    </div>
  );
}
