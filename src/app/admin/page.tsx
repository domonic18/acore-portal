import Link from "next/link";
import {
  AlertTriangle,
  ClipboardCheck,
  Package,
  Users,
} from "lucide-react";
import { getAdminDashboardCounts } from "@/server/services/stats/admin";
import { getDashboard } from "@/server/services/stats/dashboard";
import { getRecentOrders } from "@/server/services/orders/admin";
import { StatCard } from "@/components/ui/card";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { DashboardSummaryRow } from "@/components/admin/dashboard/summary-row";
import { DashboardRecentOrders } from "@/components/admin/dashboard/recent-orders";
import { DashboardQuickLinks } from "@/components/admin/dashboard/quick-links";
import { ButtonLink } from "@/components/ui/button";

/**
 * 后台仪表盘(用户反馈 2026-11-03:原仅 4 张计数卡过空):
 * 待办计数卡行 → 运营摘要(7 日交易/新注册/在线+转化漏斗摘要) → 发货异常告警
 * → 最新订单表 → 后台快捷入口;数据复用 getDashboard/getRecentOrders,零写操作。
 */
export default async function AdminHomePage() {
  const [counts, dashboard, recentOrders] = await Promise.all([
    getAdminDashboardCounts(),
    getDashboard().catch(() => null),
    getRecentOrders(8).catch(() => []),
  ]);

  return (
    <>
      <h1 className="text-[22px] font-bold text-[#dcebf7]">仪表盘</h1>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          icon={<Package />}
          value={counts.lowStock}
          label="低库存商品"
          href="/admin/products?lowStock=1"
          tone="warn"
        />
        <StatCard
          icon={<AlertTriangle />}
          value={counts.deliveryFailed}
          label="发货异常订单"
          href="/admin/orders?status=delivery_failed"
          tone={counts.deliveryFailed > 0 ? "danger" : "accent"}
        />
        <StatCard
          icon={<Users />}
          value={counts.userCount}
          label="站点用户"
          href="/admin/users"
        />
        <StatCard
          icon={<ClipboardCheck />}
          value={counts.reviewPending}
          label="迁移复核待办"
          href="/admin/review-items"
          tone={counts.reviewPending > 0 ? "warn" : "accent"}
        />
      </div>

      {dashboard && (
        <DashboardSummaryRow
          orders7d={dashboard.orders7d}
          users7d={dashboard.users7d}
          online={dashboard.online}
          funnel={dashboard.funnel}
        />
      )}

      {counts.deliveryFailed > 0 && (
        <div
          data-testid="admin-delivery-alert"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-[#eda9a9]/40 bg-[#eda9a9]/10 px-4 py-3 text-[13px] text-[#eda9a9]"
        >
          <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0" />
          有 {counts.deliveryFailed} 笔订单发货异常,已滞留待人工处理。
          <ButtonLink href="/admin/orders?status=delivery_failed" size="sm" variant="danger">
            去处理
          </ButtonLink>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="最新订单"
            actions={
              <Link
                href="/admin/orders"
                className="rounded text-[13px] text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
              >
                查看全部 →
              </Link>
            }
          />
          <CardBody className="p-0 pb-1 [&_table]:border-0">
            <DashboardRecentOrders orders={recentOrders} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="快捷入口" />
          <CardBody>
            <DashboardQuickLinks />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
