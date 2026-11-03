import { AlertTriangle } from "lucide-react";
import { ADMIN_PRODUCT_PAGE_SIZE } from "@/constants/pagination";
import { listAdminProducts } from "@/server/services/catalog/admin";
import { AdminPager } from "@/components/ui/pagination";
import { ButtonLink } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { buildPageHref } from "@/lib/pagination";
import { ProductQuickEditRow } from "@/components/admin/product-quick-edit";
import {
  ProductBatchToolbar,
  ProductSelectAllCheckbox,
  ProductSelectionProvider,
} from "@/components/admin/product-selection";

/**
 * 商品列表(FR-127/128):分页+低库存高亮(?lowStock=1 筛选,阈值因商品而异);
 * 行内快速编辑(价格/库存/状态/显隐/精选)+上下架/目录隐藏/复制/删除;新建/编辑入口。
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; lowStock?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const lowStock = searchParams.lowStock === "1";
  const { items, totalPages, total } = await listAdminProducts({ lowStock, page });

  const pageHref = (p: number) =>
    buildPageHref("/admin/products", { lowStock: lowStock ? "1" : undefined }, p);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">商品</h1>
        <FilterChip
          href={lowStock ? "/admin/products" : "/admin/products?lowStock=1"}
          active={lowStock}
          icon={<AlertTriangle />}
        >
          仅看低库存
        </FilterChip>
        <ButtonLink href="/admin/products/new" variant="primary">
          新建商品
        </ButtonLink>
      </div>

      <ProductSelectionProvider ids={items.map((p) => p.id)}>
        {items.length > 0 && <ProductBatchToolbar />}
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
            {lowStock ? "没有低库存商品。" : "暂无商品。"}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#22385a]">
            <table className="w-full min-w-[680px] border-collapse text-[13px] text-[#dcebf7]">
              <thead className="bg-[#13233a]/80 text-left">
                <tr>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">
                    <ProductSelectAllCheckbox />
                  </th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">图</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">名称</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">SKU</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">分类</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">价格</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">库存</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">状态</th>
                  <th className="border-b border-[#22385a] px-3 py-2.5 text-xs font-normal text-[#6482a3]">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p) => (
                  <ProductQuickEditRow key={p.id} product={p} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ProductSelectionProvider>

      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="件"
        href={pageHref}
        hint={`每页 ${ADMIN_PRODUCT_PAGE_SIZE} 条`}
      />
    </div>
  );
}
