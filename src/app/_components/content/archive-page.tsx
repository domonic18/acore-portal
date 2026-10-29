import Link from "next/link";
import {
  listArchiveArticles,
  listHotNews,
} from "@/server/services/content/articles";
import { ArchiveAside } from "@/components/content/archive-aside";
import { ArchiveSearch } from "@/components/content/archive-search";

/**
 * 归档页共用壳(T023,FR-209;2026-10 ardot p04 对齐):
 * 面包屑 + 大标题/总数 + 行卡列表(资讯两列卡) + 数字分页 + 右栏。
 * 四分类路由(announcements/news/guides/devlog)共用本组件。
 */
export async function ArchivePage({
  categorySlug,
  title,
  searchParams,
  layout = "rows",
  pageSize = 10,
  parent = { label: "首页", href: "/" },
}: {
  categorySlug: string;
  title: string;
  searchParams: { page?: string; q?: string };
  layout?: "rows" | "cards" | "log";
  pageSize?: number;
  parent?: { label: string; href: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const q = searchParams.q?.trim() || undefined;
  const [{ items, total, pageSize: size }, hot] = await Promise.all([
    listArchiveArticles({ categorySlug, page, q, pageSize }),
    listHotNews(5),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / size));
  const href = (p: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `/${categorySlug}?${qs}` : `/${categorySlug}`;
  };

  return (
    <main className="container-site flex-1 py-6">
      <nav aria-label="面包屑" className="mb-4 flex items-center gap-2 text-[13px]">
        <Link href={parent.href} className="text-[#6482a3] hover:text-[#6fb7e0]">
          {parent.label}
        </Link>
        <span aria-hidden="true" className="text-[#6482a3]">
          ›
        </span>
        <span className="text-[#93b2ce]">{title}</span>
      </nav>

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[30px] font-bold leading-tight text-[#dcebf7]">{title}</h1>
          <p className="mt-1.5 text-[13.5px] text-[#6482a3]">
            共 {total} 篇
            {layout === "log" && " · 持续更新"}
            {q && (
              <>
                {" · "}
                搜索“{q}” ·{" "}
                <Link href={`/${categorySlug}`} className="text-[#6fb7e0] hover:underline">
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

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          {items.length === 0 ? (
            <p className="rounded-xl border border-[#22385a] bg-[#13233a] py-16 text-center text-sm text-[#6482a3]">
              {q ? "没有匹配的文章。" : "暂无文章。"}
            </p>
          ) : layout === "cards" ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {items.map((a) => (
                <li key={a.slug}>
                  <Link
                    href={`/post/${encodeURIComponent(a.slug)}`}
                    className="group flex h-full flex-col rounded-xl border border-[#22385a] bg-[#13233a] p-5 transition hover:border-[#35577f] hover:bg-[#16283f]"
                  >
                    <div className="mb-2 flex items-center gap-2 text-[11.5px]">
                      <span className="rounded bg-[#16324d] px-1.5 py-0.5 font-medium text-[#6eb7df]">
                        {title}
                      </span>
                      <span className="text-[#6482a3]">
                        {a.publishedAt?.toISOString().slice(0, 10)}
                      </span>
                    </div>
                    <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-6 text-[#dcebf7] group-hover:text-[#6fb7e0]">
                      {a.title}
                    </h3>
                    {a.excerpt && (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-6 text-[#93b2ce]">
                        {a.excerpt}
                      </p>
                    )}
                    <p className="mt-auto pt-3 text-[12.5px] text-[#6482a3]">
                      {a.views} 次阅读
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          ) : layout === "log" ? (
            <ul className="overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a]">
              {items.map((a, i) => {
                const iso = a.publishedAt?.toISOString().slice(0, 10) ?? "";
                return (
                  <li
                    key={a.slug}
                    className={`border-t border-[#22385a] first:border-t-0 ${
                      i === 0
                        ? "bg-[linear-gradient(90deg,rgba(232,200,119,0.12),rgba(232,200,119,0))] shadow-[inset_0_0_0_1px_rgba(232,200,119,0.4)]"
                        : ""
                    }`}
                  >
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="group flex flex-col gap-1 px-4 py-3 transition hover:bg-[#16283f] sm:flex-row sm:gap-3.5"
                    >
                      <span className="shrink-0 text-[15px] font-bold text-[#e8c877] sm:w-[120px] sm:text-[17px]">
                        {iso || "—"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14.5px] leading-[26px] text-[#93b2ce] group-hover:text-[#6fb7e0]">
                          {a.title}
                        </span>
                        {a.excerpt && (
                          <span className="mt-0.5 line-clamp-2 block text-[12.5px] leading-5 text-[#6482a3]">
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
                const iso = a.publishedAt?.toISOString().slice(0, 10) ?? "";
                return (
                  <li key={a.slug}>
                    <Link
                      href={`/post/${encodeURIComponent(a.slug)}`}
                      className="group flex items-start gap-5 rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4 transition hover:border-[#35577f] hover:bg-[#16283f]"
                    >
                      <div className="w-[90px] shrink-0 text-right">
                        <div className="text-[15px] font-semibold text-[#93b2ce]">
                          {iso.slice(5)}
                        </div>
                        <div className="text-[11.5px] text-[#6482a3]">{iso.slice(0, 4)}</div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-[12px] font-semibold text-[#e8c877]">
                            {title}
                          </span>
                          <h3 className="line-clamp-1 text-[16px] font-semibold text-[#dcebf7] group-hover:text-[#6fb7e0]">
                            {a.title}
                          </h3>
                        </div>
                        {a.excerpt && (
                          <p className="mt-1.5 line-clamp-2 text-[13px] leading-6 text-[#93b2ce]">
                            {a.excerpt}
                          </p>
                        )}
                        <p className="mt-1.5 text-[12px] text-[#6482a3]">
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
            className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-3 text-[13px]"
          >
            <div className="flex items-center gap-1">
              {page > 1 && (
                <Link
                  href={href(1)}
                  className="rounded-md px-2.5 py-1.5 text-[#6482a3] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                >
                  首页
                </Link>
              )}
              {page > 1 && (
                <Link
                  href={href(page - 1)}
                  className="rounded-md px-2.5 py-1.5 text-[#93b2ce] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                >
                  ← 上一页
                </Link>
              )}
              {pageWindow(page, totalPages).map((p, i) =>
                p === null ? (
                  <span key={`gap-${i}`} className="px-1 text-[#6482a3]">
                    …
                  </span>
                ) : (
                  <Link
                    key={p}
                    href={href(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={
                      p === page
                        ? "flex h-8 w-[34px] items-center justify-center rounded-[7px] bg-[#6eb7df] font-semibold text-[#08131f]"
                        : "flex h-8 w-[34px] items-center justify-center rounded-[7px] text-[#93b2ce] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                    }
                  >
                    {p}
                  </Link>
                ),
              )}
              {page < totalPages && (
                <Link
                  href={href(page + 1)}
                  className="rounded-md px-2.5 py-1.5 text-[#93b2ce] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                >
                  下一页 →
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={href(totalPages)}
                  className="rounded-md px-2.5 py-1.5 text-[#6482a3] hover:bg-[#13233a] hover:text-[#6fb7e0]"
                >
                  末页
                </Link>
              )}
            </div>
            <span className="ml-auto text-[12px] text-[#6482a3]">
              第 {page} / {totalPages} 页 · 共 {total} 篇 · 每页 {size} 篇
            </span>
          </nav>
        </div>

        <ArchiveAside hot={hot} />
      </div>
    </main>
  );
}

/** 数字页码窗口:≤7 全列,否则 首/…/当前±1/…/末(null=省略号) */
function pageWindow(page: number, total: number): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | null)[] = [];
  for (const p of sorted) {
    const prev = out.at(-1);
    if (typeof prev === "number" && p - prev > 1) out.push(null);
    out.push(p);
  }
  return out;
}
