import Link from "next/link";
import {
  ADMIN_PRODUCT_PAGE_SIZE,
  listAdminProducts,
} from "@/server/services/catalog/admin";
import { ProductStatusActions } from "@/components/admin/product-status-actions";
import {
  ProductBatchToolbar,
  ProductRowCheckbox,
  ProductSelectAllCheckbox,
  ProductSelectionProvider,
} from "@/components/admin/product-selection";

/**
 * 商品列表(FR-127/128):分页+低库存高亮(?lowStock=1 筛选,阈值因商品而异);
 * 行内上下架/目录隐藏;新建/编辑入口。
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
    `/admin/products?page=${p}${lowStock ? "&lowStock=1" : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">商品</h1>
        <Link
          href={lowStock ? "/admin/products" : "/admin/products?lowStock=1"}
          className={`rounded border px-3 py-1 text-sm ${
            lowStock
              ? "border-amber-700 bg-amber-950 text-amber-300"
              : "border-gray-700 text-gray-300 hover:bg-gray-800"
          }`}
        >
          {lowStock ? "✓ 仅看低库存" : "仅看低库存"}
        </Link>
        <Link
          href="/admin/products/new"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          新建商品
        </Link>
      </div>

      <ProductSelectionProvider ids={items.map((p) => p.id)}>
        {items.length > 0 && <ProductBatchToolbar />}
        {items.length === 0 ? (
          <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
            {lowStock ? "没有低库存商品。" : "暂无商品。"}
          </p>
        ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">
                <ProductSelectAllCheckbox />
              </th>
              <th className="py-2 pr-3 font-normal">图</th>
              <th className="py-2 pr-3 font-normal">名称</th>
              <th className="py-2 pr-3 font-normal">SKU</th>
              <th className="py-2 pr-3 font-normal">分类</th>
              <th className="py-2 pr-3 font-normal">价格</th>
              <th className="py-2 pr-3 font-normal">库存</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr
                key={p.id}
                className={`border-b border-gray-900 ${
                  p.lowStock ? "bg-amber-950/40" : ""
                }`}
              >
                <td className="py-2 pr-3">
                  <ProductRowCheckbox id={p.id} />
                </td>
                <td className="py-2 pr-3">
                  {p.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.image}
                      alt=""
                      loading="lazy"
                      draggable={false}
                      className="h-9 w-9 rounded border border-gray-700 object-contain"
                    />
                  ) : (
                    <span aria-hidden className="text-lg text-gray-600">
                      {p.type === "game_item" ? "⚔" : "🛠"}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/products/${p.id}`}
                    className="text-blue-400 hover:underline"
                  >
                    {p.name}
                  </Link>
                  {p.salePrice != null && (
                    <span className="ml-2 text-xs text-amber-400">
                      促销 {p.salePrice}
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-gray-400">{p.sku}</td>
                <td className="py-2 pr-3 text-gray-400">{p.categoryName}</td>
                <td className="py-2 pr-3 text-amber-400">{p.price}</td>
                <td className="py-2 pr-3">
                  {p.stockEnabled ? (
                    <span className={p.lowStock ? "font-semibold text-amber-300" : "text-gray-300"}>
                      {p.stock}
                      {p.lowStock && " (低库存)"}
                    </span>
                  ) : (
                    <span className="text-gray-600">不限</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      p.status === "published"
                        ? "bg-green-950 text-green-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {p.status === "published" ? "已发布" : "草稿"}
                  </span>
                  {!p.listed && (
                    <span className="ml-1 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-500">
                      目录隐藏
                    </span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  <ProductStatusActions
                    productId={p.id}
                    status={p.status}
                    listed={p.listed}
                    type={p.type}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </ProductSelectionProvider>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 件</span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-4">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-blue-400 hover:underline">
                上一页
              </Link>
            ) : (
              <span className="text-gray-600">上一页</span>
            )}
            <span>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-blue-400 hover:underline">
                下一页
              </Link>
            ) : (
              <span className="text-gray-600">下一页</span>
            )}
          </nav>
        )}
        <span className="text-xs text-gray-600">每页 {ADMIN_PRODUCT_PAGE_SIZE} 条</span>
      </div>
    </div>
  );
}
