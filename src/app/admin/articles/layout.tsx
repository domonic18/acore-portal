import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「内容」外壳(2026-11-18 用户反馈:菜单收敛——静态页并入文章页,
 * 同组页内 Tab 切换)。
 */
export default function AdminArticlesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">内容</h1>
      <AdminTabs
        ariaLabel="内容分区"
        items={[
          { href: "/admin/articles", label: "文章" },
          { href: "/admin/articles/pages", label: "静态页" },
        ]}
      />
      {children}
    </div>
  );
}
