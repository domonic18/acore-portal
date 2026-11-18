import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「首页配置」外壳(2026-11-18 用户反馈:菜单收敛——状态配置并入首页配置,
 * 同组页内 Tab 切换)。
 */
export default function AdminHomeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">首页配置</h1>
      <AdminTabs
        ariaLabel="首页配置分区"
        items={[
          { href: "/admin/home", label: "首页" },
          { href: "/admin/home/server-status", label: "状态" },
        ]}
      />
      {children}
    </div>
  );
}
