import { requireAdmin } from "@/server/session-guard";
import { getAdminBadgeCounts } from "@/server/services/stats/admin";
import { getAdminDisplayName } from "@/server/services/users-admin/admin";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * 后台布局守卫(FR-125):requireAdmin 一次覆盖全部子页,moderator/user/未登录
 * 重定向首页并记审计;外壳按 p12 设计稿(分组侧栏/顶栏告警/内容区),
 * 低库存与发货异常计数注入顶栏(FR-128)。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const [counts, adminName] = await Promise.all([
    getAdminBadgeCounts(),
    getAdminDisplayName(BigInt(session.userId)),
  ]);

  return (
    <AdminShell
      adminName={adminName}
      lowStock={counts.lowStock}
      deliveryFailed={counts.deliveryFailed}
    >
      {children}
    </AdminShell>
  );
}
