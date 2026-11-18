import { listAdminCategories, listAdminCategoryOptions } from "@/server/services/catalog/admin";
import { CategoryForm } from "@/components/admin/category-form";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import type { CategoryNode } from "@/lib/catalog-tree";

/** 分类管理(FR-126):树形列表 + 新增(可指定上级分类);商品计数只读。 */

type FlatCategory = CategoryNode & { depth: number };

function flattenTree(nodes: CategoryNode[], depth = 0): FlatCategory[] {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
}

export default async function AdminCategoriesPage() {
  const [tree, options] = await Promise.all([
    listAdminCategories(),
    listAdminCategoryOptions(),
  ]);
  const rows = flattenTree(tree);
  // 上级分类下拉:全部现有分类都可当上级(按树序,层级用缩进提示)
  const parentOptions = options.map((c) => ({
    id: c.id,
    name: `${c.depth > 0 ? "　".repeat(c.depth) : ""}${c.name}`,
  }));

  return (
    <div className="flex flex-col gap-4">
      <CategoryForm parentOptions={parentOptions} />
      {rows.length === 0 ? (
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
              <Th>自身商品</Th>
              <Th>子树合计</Th>
            </tr>
          </THead>
          <tbody>
            {rows.map((c) => (
              <Tr key={c.id}>
                <Td className="text-[#dcebf7]">
                  <span style={{ paddingLeft: `${c.depth * 18}px` }} className="inline-flex items-center gap-1.5">
                    {c.depth > 0 ? (
                      <span className="text-[#3f5f85]" aria-hidden="true">
                        └
                      </span>
                    ) : null}
                    {c.name}
                  </span>
                </Td>
                <Td className="font-mono text-xs text-[#93b2ce]">{c.slug}</Td>
                <Td className="text-[#93b2ce]">{c.sort}</Td>
                <Td className="text-[#93b2ce]">
                  {c.ownCount === 0 ? (
                    <span className="text-[#eda9a9]">0 商品</span>
                  ) : (
                    c.ownCount
                  )}
                </Td>
                <Td className="text-[#93b2ce]">{c.subtreeCount}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
