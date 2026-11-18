import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「系统设置」外壳(2026-11-18 用户反馈:菜单收敛——积分规则并入系统设置,
 * 同组页内 Tab 切换)。
 */
export default function AdminSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">系统设置</h1>
      <AdminTabs
        ariaLabel="系统设置分区"
        items={[
          { href: "/admin/settings", label: "常规" },
          { href: "/admin/settings/point-rules", label: "积分规则" },
        ]}
      />
      {children}
    </div>
  );
}
