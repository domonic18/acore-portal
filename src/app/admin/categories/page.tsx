import { listAdminCategories } from "@/server/services/catalog/admin";
import { CategoryForm } from "@/components/admin/category-form";

/** 分类管理(FR-126,平铺排序):列表+新增;商品计数只读。 */
export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">分类</h1>
      <CategoryForm />
      {categories.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          暂无分类,先在上方新增一个。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">名称</th>
              <th className="py-2 pr-3 font-normal">slug</th>
              <th className="py-2 pr-3 font-normal">排序</th>
              <th className="py-2 pr-3 font-normal">商品数</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} className="border-b border-gray-900">
                <td className="py-2 pr-3 text-gray-200">{c.name}</td>
                <td className="py-2 pr-3 font-mono text-xs text-gray-400">{c.slug}</td>
                <td className="py-2 pr-3 text-gray-400">{c.sort}</td>
                <td className="py-2 pr-3 text-gray-400">{c.productCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
