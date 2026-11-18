import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「看板」外壳(2026-11-18 用户反馈:菜单收敛——安全看板并入统计看板,
 * 同组页内 Tab 切换;数据指标组居菜单首位)。
 */
export default function AdminStatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">看板</h1>
      <AdminTabs
        ariaLabel="看板分区"
        items={[
          { href: "/admin/stats", label: "统计看板" },
          { href: "/admin/stats/security", label: "安全看板" },
        ]}
      />
      {children}
    </div>
  );
}
