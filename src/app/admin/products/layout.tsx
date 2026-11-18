import { AdminTabs } from "@/components/admin/admin-tabs";

/**
 * 后台「商品」外壳(2026-11-18 用户反馈:菜单收敛——分类管理并入商品页,
 * 同组页内 Tab 切换)。
 */
export default function AdminProductsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">商品</h1>
      <AdminTabs
        ariaLabel="商品分区"
        items={[
          { href: "/admin/products", label: "商品列表" },
          { href: "/admin/products/categories", label: "分类管理" },
        ]}
      />
      {children}
    </div>
  );
}
