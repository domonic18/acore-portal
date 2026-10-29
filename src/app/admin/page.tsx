import Link from "next/link";
import { countLowStockProducts } from "@/server/services/catalog/admin";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/** 后台总览:计数卡(低库存/发货异常/用户/复核待办),导航由后台外壳侧栏提供 */
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
      <h1 className="text-[22px] font-bold text-[#dcebf7]">仪表盘</h1>
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex flex-col gap-1.5 rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4 transition hover:border-[#35577f] hover:bg-[#16283f]"
          >
            <span className="text-[26px] font-bold leading-none text-[#a8d9f5]">
              {c.value}
            </span>
            <span className="text-[12.5px] text-[#6482a3]">{c.label}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
