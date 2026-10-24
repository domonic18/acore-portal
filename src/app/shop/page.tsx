import Link from "next/link";
import { listProducts } from "@/server/services/catalog/products";
import { listCategories } from "@/server/services/catalog/categories";
import { PRODUCT_SORT } from "@/constants/shop";

/**
 * T020 商城列表(/shop 旧路径不变 FR-109):RSC 直读服务层;
 * 分类筛选/排序/分页全为 URL 参数(可分享可回退);卡片图占位,真图延 US6 COS。
 * 后台随时上下架/改价,列表禁静态化。
 */
export const dynamic = "force-dynamic";

const SORTS = [
  { value: PRODUCT_SORT.NEWEST, label: "最新" },
  { value: PRODUCT_SORT.PRICE_ASC, label: "价格从低到高" },
  { value: PRODUCT_SORT.PRICE_DESC, label: "价格从高到低" },
] as const;

function shopHref(params: { category?: string; sort?: string; page?: number }): string {
  const sp = new URLSearchParams();
  if (params.category) sp.set("category", params.category);
  if (params.sort && params.sort !== PRODUCT_SORT.NEWEST) sp.set("sort", params.sort);
  if (params.page && params.page > 1) sp.set("page", String(params.page));
  const qs = sp.toString();
  return qs ? `/shop?${qs}` : "/shop";
}

export default async function ShopPage({
  searchParams,
}: {
  searchParams: { category?: string; sort?: string; page?: string };
}) {
  const sort = searchParams.sort ?? PRODUCT_SORT.NEWEST;
  const page = Number.parseInt(searchParams.page ?? "1", 10) || 1;
  const [categories, result] = await Promise.all([
    listCategories(),
    listProducts({ categorySlug: searchParams.category, sort, page }),
  ]);

  const activeCategory = searchParams.category ?? "";

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between border-b border-gray-800 pb-3">
        <h1 className="text-2xl font-bold">商城</h1>
        <Link href="/cart" className="text-sm text-gray-300 hover:text-white">
          购物车
        </Link>
      </header>

      <nav aria-label="商品分类" className="flex flex-wrap gap-2">
        <Link
          href={shopHref({ sort })}
          className={`rounded-full border px-3 py-1 text-sm ${
            activeCategory === ""
              ? "border-blue-500 bg-blue-950 text-white"
              : "border-gray-700 text-gray-300 hover:border-gray-500"
          }`}
        >
          全部
        </Link>
        {categories.map((c) => (
          <Link
            key={c.slug}
            href={shopHref({ category: c.slug, sort })}
            className={`rounded-full border px-3 py-1 text-sm ${
              activeCategory === c.slug
                ? "border-blue-500 bg-blue-950 text-white"
                : "border-gray-700 text-gray-300 hover:border-gray-500"
            }`}
          >
            {c.name}
          </Link>
        ))}
      </nav>

      <nav aria-label="排序" className="flex gap-3 text-sm">
        {SORTS.map((s) => (
          <Link
            key={s.value}
            href={shopHref({ category: activeCategory || undefined, sort: s.value })}
            className={`${
              sort === s.value ? "font-semibold text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </nav>

      {result.items.length === 0 ? (
        <p className="py-16 text-center text-gray-400">该分类暂无商品。</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {result.items.map((p) => (
            <li key={p.id}>
              <Link
                href={`/shop/${p.slug}`}
                className="flex flex-col gap-2 rounded border border-gray-800 p-3 transition-colors hover:border-gray-600"
              >
                <div
                  aria-hidden
                  className="flex h-32 items-center justify-center rounded bg-gradient-to-br from-indigo-950 to-gray-900 text-4xl"
                >
                  {p.type === "game_item" ? "⚔" : "🛠"}
                </div>
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-gray-400">{p.categoryName}</span>
                <span className="flex items-baseline gap-2">
                  <span className="text-lg font-bold text-amber-400">{p.effectivePrice}</span>
                  {p.onSale && (
                    <span className="text-sm text-gray-500 line-through">{p.price}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {result.totalPages > 1 && (
        <nav aria-label="分页" className="flex items-center justify-center gap-4">
          {result.page > 1 ? (
            <Link
              href={shopHref({
                category: activeCategory || undefined,
                sort,
                page: result.page - 1,
              })}
              className="text-sm text-gray-300 hover:text-white"
            >
              上一页
            </Link>
          ) : (
            <span className="text-sm text-gray-600">上一页</span>
          )}
          <span className="text-sm text-gray-400">
            第 {result.page} / {result.totalPages} 页
          </span>
          {result.page < result.totalPages ? (
            <Link
              href={shopHref({
                category: activeCategory || undefined,
                sort,
                page: result.page + 1,
              })}
              className="text-sm text-gray-300 hover:text-white"
            >
              下一页
            </Link>
          ) : (
            <span className="text-sm text-gray-600">下一页</span>
          )}
        </nav>
      )}
    </main>
  );
}
