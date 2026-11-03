import { listAdminCategories } from "@/server/services/catalog/admin";
import { CategoryForm } from "@/components/admin/category-form";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";

/** 分类管理(FR-126,平铺排序):列表+新增;商品计数只读。 */
export default async function AdminCategoriesPage() {
  const categories = await listAdminCategories();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">分类</h1>
      <CategoryForm />
      {categories.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          暂无分类,先在上方新增一个。
        </p>
      ) : (
        <Table minWidth="min-w-0">
          <THead>
            <tr>
              <Th>名称</Th>
              <Th>slug</Th>
              <Th>排序</Th>
              <Th>商品数</Th>
            </tr>
          </THead>
          <tbody>
            {categories.map((c) => (
              <Tr key={c.id}>
                <Td className="text-[#dcebf7]">{c.name}</Td>
                <Td className="font-mono text-xs text-[#93b2ce]">{c.slug}</Td>
                <Td className="text-[#93b2ce]">{c.sort}</Td>
                <Td className="text-[#93b2ce]">{c.productCount}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
