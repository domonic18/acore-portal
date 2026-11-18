import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「渐进计划」外壳(2026-11-18 用户反馈:状态卡配置迁入本组,
 * 与渐进计划编辑页内 Tab 切换,首页配置不再承载状态开关)。
 */
export default function AdminProgressionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">渐进计划</h1>
      <AdminTabs
        ariaLabel="渐进计划分区"
        items={[
          { href: "/admin/progression", label: "渐进计划" },
          { href: "/admin/progression/server-status", label: "状态卡" },
        ]}
      />
      {children}
    </div>
  );
}
