import Link from "next/link";
import { ArchiveAside } from "@/components/content/archive-aside";
import { ArchiveSearch } from "@/components/content/archive-search";
import { formatDate } from "@/lib/format";
import { pageWindow, paginate } from "@/lib/pagination";

type ArchiveListItem = {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  views: number;
};

/**
 * 归档页共用壳(T023,FR-209;2026-10 ardot p04 对齐):
 * 面包屑 + 大标题/总数 + 行卡列表(资讯两列卡) + 数字分页 + 右栏。
 * 三分类路由(announcements/news/guides)共用本组件(devlog 为单页 Markdown,不走归档);
 * 数据由页面层经 getArchiveView 取得后下发。
 */
export function ArchivePage({
  categorySlug,
  title,
  layout = "rows",
  parent = { label: "首页", href: "/" },
  page,
  q,
  items,
  total,
  pageSize: size,
  hot,
}: {
  categorySlug: string;
  title: string;
  page: number;
  q?: string;
  items: ArchiveListItem[];
  total: number;
  pageSize: number;
  hot: { slug: string; title: string; views: number }[];
  layout?: "rows" | "cards" | "log";
  parent?: { label: string; href: string };
}) {
  const { totalPages } = paginate(total, page, size);
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/${categorySlug}?${qs}` : `/${categorySlug}`;
  };

  return (
    <main className="container-site flex-1 py-6">
      <div className="mb-5 rounded-xl border border-line bg-panel px-5 py-4">
        <nav aria-label="面包屑" className="mb-2.5 flex items-center gap-2 text-[13px]">
          <Link href={parent.href} className="text-muted hover:text-link">
            {parent.label}
          </Link>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
          <span className="text-body">{title}</span>
        </nav>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[30px] font-bold leading-tight text-heading">{title}</h1>
            <p className="mt-1.5 text-[13.5px] text-muted">
              共 {total} 篇
              {layout === "log" && " · 持续更新"}
              {q && (
                <>
                  {" · "}
                  搜索“{q}” ·{" "}
                  <Link href={`/${categorySlug}`} className="text-link hover:underline">
                    清除
                  </Link>
                </>
              )}
            </p>
          </div>
          <div className="w-full sm:w-[280px]">
            <ArchiveSearch />
          </div>
        </div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {items.length === 0 ? (
            <p className="rounded-xl border border-line bg-panel py-16 text-center text-sm text-muted">
              {q ? "没有匹配的文章。" : "暂无文章。"}
            </p>
          ) : layout === "cards" ? (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((a) => (
                <li key={a.slug} className="min-w-0">
                  <Link
                    href={`/post/${encodeURIComponent(a.slug)}`}
                    className="group flex h-full min-w-0 flex-col rounded-xl border border-line bg-panel p-5 transition hover:border-line-strong hover:bg-panel-hover"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[11.5px]">
                      <span className="shrink-0 rounded bg-chip px-1.5 py-0.5 font-medium text-link">
                        {title}
                      </span>
                      <span className="shrink-0 text-muted">
                        {a.publishedAt && formatDate(a.publishedAt)}
                      </span>
                    </div>
                    <h3 className="line-clamp-2 break-words text-[15.5px] font-semibold leading-6 text-heading group-hover:text-link">
                      {a.title}
                    </h3>
                    {a.excerpt && (
                      <p className="mt-2 line-clamp-2 break-words text-[13px] leading-6 text-body">
                        {a.excerpt}
                      </p>
                    )}
                    <p className="mt-auto pt-3 text-[12.5px] text-muted">
                      {a.views} 次阅读
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : layout === "log" ? (
            <ul className="overflow-hidden rounded-xl border border-line bg-panel">
              {items.map((a, i) => {
                const iso = a.publishedAt ? formatDate(a.publishedAt) : "";
                return (
                  <li
                    key={a.slug}
                    className={`border-t border-line first:border-t-0 ${
                      i === 0
                        ? "bg-[linear-gradient(90deg,rgba(232,200,119,0.12),rgba(232,200,119,0))] shadow-[inset_0_0_0_1px_rgba(232,200,119,0.4)]"
                        : ""
                    }`}
                  >
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="group flex flex-col gap-1 px-4 py-3 transition hover:bg-panel-hover sm:flex-row sm:gap-3.5"
                    >
                      <span className="shrink-0 text-[15px] font-bold text-highlight sm:w-[120px] sm:text-[17px]">
                        {iso || "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] leading-[26px] text-body group-hover:text-link">
                          {a.title}
                        </span>
                        {a.excerpt && (
                          <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-5 text-muted">
                            {a.excerpt}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="space-y-3">
              {items.map((a) => {
                const iso = a.publishedAt ? formatDate(a.publishedAt) : "";
                return (
                  <li key={a.slug}>
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="group flex items-start gap-5 rounded-xl border border-line bg-panel px-5 py-4 transition hover:border-line-strong hover:bg-panel-hover"
                    >
                      <div className="w-[90px] shrink-0 text-right">
                        <div className="text-[15px] font-semibold text-body">
                          {iso.slice(5)}
                        </div>
                        <div className="text-[11.5px] text-muted">{iso.slice(0, 4)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[12px] font-semibold text-highlight">
                            {title}
                          </span>
                          <h3 className="line-clamp-1 text-[16px] font-semibold text-heading group-hover:text-link">
                            {a.title}
                          </h3>
                        </div>
                        {a.excerpt && (
                          <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-body">
                            {a.excerpt}
                          </p>
                        )}
                        <p className="mt-1.5 text-[12px] text-muted">
                          {a.views} 次阅读
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}

          <nav
            aria-label="分页"
            className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3 rounded-xl border border-line bg-panel px-4 py-3 text-[13px]"
          >
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Link
                  href={href(1)}
                  className="rounded-md px-2.5 py-1.5 text-muted hover:bg-panel hover:text-link"
                >
                  首页
                </Link>
              )}
              {page > 1 && (
                <Link
                  href={href(page - 1)}
                  className="rounded-md px-2.5 py-1.5 text-body hover:bg-panel hover:text-link"
                >
                  ← 上一页
                </Link>
              )}
              {pageWindow(page, totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-muted">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={href(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={
                      p === page
                        ? "flex h-8 w-[34px] items-center justify-center rounded-[7px] bg-link font-semibold text-ink"
                        : "flex h-8 w-[34px] items-center justify-center rounded-[7px] text-body hover:bg-panel hover:text-link"
                    }
                  >
                    {p}
                  </Link>
                ),
              )}
              {page < totalPages && (
                <Link
                  href={href(page + 1)}
                  className="rounded-md px-2.5 py-1.5 text-body hover:bg-panel hover:text-link"
                >
                  下一页 →
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={href(totalPages)}
                  className="rounded-md px-2.5 py-1.5 text-muted hover:bg-panel hover:text-link"
                >
                  末页
                </Link>
              )}
            </div>
            <span className="ml-auto text-[12px] text-muted">
              第 {page} / {totalPages} 页 · 共 {total} 篇 · 每页 {size} 篇
            </span>
          </nav>
        </div>

        <ArchiveAside hot={hot} />
      </div>
    </main>
  );
}
