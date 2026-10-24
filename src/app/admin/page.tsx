import Link from "next/link";
import { ADMIN_NAV } from "@/constants/navigation";
import { countLowStockProducts } from "@/server/services/catalog/admin";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/** 后台总览(M2 最小集):计数面板+导航入口;D3 复核清单页归 US6 T062 */
export default async function AdminHomePage() {
  const [lowStock, deliveryFailed, userCount, reviewPending] = await Promise.all([
    countLowStockProducts(),
    prisma.order.count({ where: { status: ORDER_STATUS.DELIVERY_FAILED } }),
    prisma.user.count(),
    prisma.migrationReviewItem.count({ where: { resolvedAt: null } }),
  ]);

  const cards = [
    { label: "低库存商品", value: lowStock, href: "/admin/products?lowStock=1" },
    { label: "发货异常订单", value: deliveryFailed, href: "/admin/orders?status=delivery_failed" },
    { label: "站点用户", value: userCount, href: "/admin/users" },
    { label: "迁移复核待办", value: reviewPending, href: "/admin/review-items" },
  ];

  return (
    <>
      <h1 className="text-2xl font-bold">总览</h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex flex-col gap-1 rounded border border-gray-800 p-4 hover:border-gray-600"
          >
            <span className="text-2xl font-bold">{c.value}</span>
            <span className="text-sm text-gray-400">{c.label}</span>
          </Link>
        ))}
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        {ADMIN_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded border border-gray-700 px-3 py-1.5 text-gray-300 hover:bg-gray-800"
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
