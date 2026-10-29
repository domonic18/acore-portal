import { requireAdmin } from "@/server/session-guard";
import { countLowStockProducts } from "@/server/services/catalog/admin";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * 后台布局守卫(FR-125):requireAdmin 一次覆盖全部子页,moderator/user/未登录
 * 重定向首页并记审计;外壳按 p12 设计稿(分组侧栏/顶栏告警/内容区),
 * 低库存与发货异常计数注入顶栏(FR-128)。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const [lowStock, deliveryFailed, admin] = await Promise.all([
    countLowStockProducts(),
    prisma.order.count({ where: { status: ORDER_STATUS.DELIVERY_FAILED } }),
    prisma.user.findUnique({
      where: { id: BigInt(session.userId) },
      select: { username: true },
    }),
  ]);

  return (
    <AdminShell
      adminName={admin?.username ?? "管理员"}
      lowStock={lowStock}
      deliveryFailed={deliveryFailed}
    >
      {children}
    </AdminShell>
  );
}
