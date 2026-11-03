import { requireAdmin } from "@/server/session-guard";
import { getAdminDisplayName } from "@/server/services/users-admin/admin";
import { AdminShell } from "@/components/admin/admin-shell";

/**
 * 后台布局守卫(FR-125):requireAdmin 一次覆盖全部子页,moderator/user/未登录
 * 重定向首页并记审计。低库存/发货异常告警收敛到仪表盘计数卡+横幅
 * (2026-11-03 用户反馈:状态不应显示在导航区域),顶栏只留面包屑+管理员。
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdmin();
  const adminName = await getAdminDisplayName(BigInt(session.userId));

  return (
    <AdminShell adminName={adminName}>
      {children}
    </AdminShell>
  );
}
