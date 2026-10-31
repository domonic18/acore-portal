import Link from "next/link";
import { listAdminArticles } from "@/server/services/content/admin";
import { ArticleDeleteButton } from "@/components/admin/article-actions";

/**
 * 文章列表(T032,FR-215):q 标题搜索+状态筛选+分页 20/页(含 draft);
 * 行内编辑/删除;新建入口。
 */
export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string; status?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const q = searchParams.q || undefined;
  const status = searchParams.status === "draft" || searchParams.status === "published"
    ? searchParams.status
    : undefined;
  const { items, totalPages, total } = await listAdminArticles({ page, q, status });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `/admin/articles${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">文章</h1>
        <form action="/admin/articles" method="get" className="flex items-center gap-2">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="搜索标题…"
            className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-white"
          />
          <select name="status" defaultValue={status ?? ""} className="rounded border border-gray-700 bg-gray-900 px-2 py-1.5 text-sm text-white">
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </select>
          <button type="submit" className="rounded border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800">
            筛选
          </button>
        </form>
        <Link
          href="/admin/articles/new"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          新建文章
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          没有匹配的文章。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">标题</th>
              <th className="py-2 pr-3 font-normal">分类</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">阅读</th>
              <th className="py-2 pr-3 font-normal">发布时间</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-gray-900">
                <td className="py-2 pr-3">
                  <Link href={`/admin/articles/${a.id}`} className="text-blue-400 hover:underline">
                    {a.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-gray-600">{a.slug}</span>
                </td>
                <td className="py-2 pr-3 text-gray-400">{a.categoryName}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      a.status === "published"
                        ? "bg-green-950 text-green-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {a.status === "published" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-400">{a.views}</td>
                <td className="py-2 pr-3 text-gray-500">
                  {a.publishedAt ? a.publishedAt.slice(0, 10) : "—"}
                </td>
                <td className="flex gap-3 py-2 pr-3">
                  <Link href={`/admin/articles/${a.id}`} className="text-blue-400 hover:underline">
                    编辑
                  </Link>
                  <ArticleDeleteButton id={a.id} title={a.title} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 篇</span>
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
      </div>
    </div>
  );
}
