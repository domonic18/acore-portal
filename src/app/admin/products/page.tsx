import { AlertTriangle } from "lucide-react";
import { ADMIN_PRODUCT_PAGE_SIZE } from "@/constants/pagination";
import { PRODUCT_TYPE } from "@/constants/shop";
import { listAdminCategories, listAdminProducts } from "@/server/services/catalog/admin";
import { AdminPager } from "@/components/ui/pagination";
import { Table, THead, Th } from "@/components/ui/table";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
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
 * 筛选(#152 搜索框 + #156 类别筛选):q 命中名称/slug/SKU,type 命中物品类/服务类,
 * category 命中所属分类;三者与 lowStock 可叠加,分页链接原样带参。
 */
export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: { page?: string; lowStock?: string; q?: string; type?: string; category?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const lowStock = searchParams.lowStock === "1";
  const q = searchParams.q?.trim() || undefined;
  const type =
    searchParams.type === PRODUCT_TYPE.GAME_ITEM || searchParams.type === PRODUCT_TYPE.SERVICE
      ? searchParams.type
      : undefined;
  const categoryId = /^\d+$/.test(searchParams.category ?? "")
    ? BigInt(searchParams.category as string)
    : undefined;

  const [{ items, totalPages, total }, categories] = await Promise.all([
    listAdminProducts({ lowStock, page, q, type, categoryId }),
    listAdminCategories(),
  ]);

  const pageHref = (p: number) =>
    buildPageHref(
      "/admin/products",
      {
        lowStock: lowStock ? "1" : undefined,
        q,
        type,
        category: categoryId?.toString(),
      },
      p,
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">商品</h1>
        <FilterChip
          href={buildPageHref(
            "/admin/products",
            {
              lowStock: lowStock ? undefined : "1",
              q,
              type,
              category: categoryId?.toString(),
            },
            1,
          )}
          active={lowStock}
          icon={<AlertTriangle />}
        >
          仅看低库存
        </FilterChip>
        <ButtonLink href="/admin/products/new" variant="primary">
          新建商品
        </ButtonLink>
      </div>

      <form
        action="/admin/products"
        method="get"
        className="flex flex-wrap items-center gap-2"
        aria-label="商品筛选"
      >
        {lowStock && <input type="hidden" name="lowStock" value="1" />}
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="搜索名称 / slug / SKU…"
          className="w-52"
          aria-label="搜索商品"
        />
        <Select name="type" defaultValue={type ?? ""} className="w-auto" aria-label="商品类别">
          <option value="">全部类别</option>
          <option value={PRODUCT_TYPE.GAME_ITEM}>物品类</option>
          <option value={PRODUCT_TYPE.SERVICE}>服务类</option>
        </Select>
        <Select
          name="category"
          defaultValue={categoryId?.toString() ?? ""}
          className="w-auto"
          aria-label="所属分类"
        >
          <option value="">全部分类</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}({c.productCount})
            </option>
          ))}
        </Select>
        <Button type="submit" size="md">
          筛选
        </Button>
      </form>

      <ProductSelectionProvider ids={items.map((p) => p.id)}>
        {items.length > 0 && <ProductBatchToolbar />}
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
            {lowStock || q || type || categoryId
              ? "没有匹配的商品。"
              : "暂无商品。"}
          </p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>
                  <ProductSelectAllCheckbox />
                </Th>
                <Th>图</Th>
                <Th>名称</Th>
                <Th>SKU</Th>
                <Th>分类</Th>
                <Th>价格</Th>
                <Th>库存</Th>
                <Th>状态</Th>
                <Th>操作</Th>
              </tr>
            </THead>
            <tbody>
              {items.map((p) => (
                <ProductQuickEditRow key={p.id} product={p} />
              ))}
            </tbody>
          </Table>
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
