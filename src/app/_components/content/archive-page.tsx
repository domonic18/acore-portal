import Link from "next/link";
import { listArchiveArticles } from "@/server/services/content/articles";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";
import { ArchiveSearch } from "@/components/content/archive-search";

/**
 * 归档页共用壳(T023,FR-209):10/页分页+标题搜索,全 URL 参数可分享可回退。
 * 四分类路由(announcements/news/guides/devlog)共用本组件。
 */
export async function ArchivePage({
  categorySlug,
  title,
  searchParams,
}: {
  categorySlug: string;
  title: string;
  searchParams: { page?: string; q?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const q = searchParams.q?.trim() || undefined;
  const { items, total, pageSize } = await listArchiveArticles({
    categorySlug,
    page,
    q,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/${categorySlug}?${qs}` : `/${categorySlug}`;
  };

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <header className="flex flex-col gap-3 border-b border-[#1e2a3d] pb-3">
          <h1 className="text-2xl font-bold text-[#e6d8a8]">
            {title}
            <span className="ml-2 text-sm font-normal text-[#5d6b80]">
              共 {total} 篇
            </span>
          </h1>
          <ArchiveSearch />
          {q && (
            <p className="text-xs text-[#8fa0b8]">
              搜索“{q}” ·{" "}
              <Link href={`/${categorySlug}`} className="hover:text-[#e6d8a8]">
                清除
              </Link>
            </p>
          )}
        </header>

        {items.length === 0 ? (
          <p className="py-12 text-center text-sm text-[#5d6b80]">
            {q ? "没有匹配的文章。" : "暂无文章。"}
          </p>
        ) : (
          <ul className="divide-y divide-[#1e2a3d]">
            {items.map((a) => (
              <li key={a.slug} className="py-3">
                <Link
                  href={`/post/${encodeURIComponent(a.slug)}`}
                  className="text-base font-medium text-[#c7d2e0] hover:text-[#e6d8a8]"
                >
                  {a.title}
                </Link>
                {a.excerpt && (
                  <p className="mt-1 line-clamp-2 text-sm text-[#8fa0b8]">
                    {a.excerpt}
                  </p>
                )}
                <p className="mt-1 text-xs text-[#5d6b80]">
                  {a.publishedAt?.toISOString().slice(0, 10)} · {a.views} 次阅读
                </p>
              </li>
            ))}
          </ul>
        )}

        <nav aria-label="分页" className="flex items-center justify-between pt-2 text-sm">
          {page > 1 ? (
            <Link href={href(page - 1)} className="text-[#c9a227] hover:text-[#e6d8a8]">
              ← 上一页
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[#5d6b80]">
            第 {page} / {totalPages} 页
          </span>
          {page < totalPages ? (
            <Link href={href(page + 1)} className="text-[#c9a227] hover:text-[#e6d8a8]">
              下一页 →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      </div>
      <SiteSidebar pageType="archive" />
    </main>
  );
}
