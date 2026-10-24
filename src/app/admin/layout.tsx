import Link from "next/link";
import { requireAdmin } from "@/server/session-guard";
import { ADMIN_NAV } from "@/constants/navigation";
import { countLowStockProducts } from "@/server/services/catalog/admin";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/**
 * 后台布局守卫(FR-125):requireAdmin 一次覆盖全部子页,moderator/user/未登录
 * 重定向首页并记审计;导航携带低库存/发货异常计数标记(FR-128 提醒,M2 不发邮件)。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const [lowStock, deliveryFailed] = await Promise.all([
    countLowStockProducts(),
    prisma.order.count({ where: { status: ORDER_STATUS.DELIVERY_FAILED } }),
  ]);

  return (
    <div className="flex min-h-screen flex-col gap-6">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-gray-800 pb-3">
        <span className="text-lg font-bold">运营后台</span>
        <nav className="flex flex-wrap items-center gap-4 text-sm">
          <Link href="/admin" className="text-gray-300 hover:text-white">
            总览
          </Link>
          {ADMIN_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-gray-300 hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-xs">
          {lowStock > 0 && (
            <Link
              href="/admin/products?lowStock=1"
              className="rounded bg-amber-900/60 px-2 py-1 text-amber-300 hover:bg-amber-900"
            >
              低库存 {lowStock}
            </Link>
          )}
          {deliveryFailed > 0 && (
            <Link
              href="/admin/orders?status=delivery_failed"
              className="rounded bg-red-900/60 px-2 py-1 text-red-300 hover:bg-red-900"
            >
              发货异常 {deliveryFailed}
            </Link>
          )}
        </div>
      </header>
      <main className="flex flex-col gap-6 pb-10">{children}</main>
    </div>
  );
}
