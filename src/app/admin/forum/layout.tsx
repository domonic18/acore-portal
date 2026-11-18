import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「论坛管理」外壳(2026-11-18 用户反馈:query 参数 Tab 的药丸样式
 * 与其他后台页不统一,改路径子路由 + 通用 AdminTabs,风格全局一致)。
 */
export default function AdminForumLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">论坛管理</h1>
      <AdminTabs
        ariaLabel="论坛管理分区"
        items={[
          { href: "/admin/forum", label: "版块管理" },
          { href: "/admin/forum/threads", label: "主题管理" },
        ]}
      />
      {children}
    </div>
  );
}
