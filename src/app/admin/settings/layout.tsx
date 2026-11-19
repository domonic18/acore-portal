import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「系统设置」外壳(2026-11-19 用户反馈:设置页太长 → 按主题拆 Tab;
 * MCP 令牌管理并入设置,侧栏不再单列入口)。
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
          { href: "/admin/settings/game", label: "游戏通道" },
          { href: "/admin/settings/mail", label: "邮件与告警" },
          { href: "/admin/settings/security", label: "安全" },
          { href: "/admin/settings/storage", label: "存储与备份" },
          { href: "/admin/settings/mcp", label: "MCP 接入" },
          { href: "/admin/settings/point-rules", label: "积分规则" },
        ]}
      />
      {children}
    </div>
  );
}
