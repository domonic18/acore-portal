import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAdjacentArticles,
  getArticleBySlug,
  listLatestNews,
} from "@/server/services/content/articles";
import { getServerStatus } from "@/server/services/status/status";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";
import { ArticleAside } from "@/components/content/article-aside";
import { ViewCounter } from "@/components/content/view-counter";
import { WowheadTooltips } from "@/components/content/wowhead-tooltips";

/**
 * 文章详情(T024,FR-210/211;2026-10 ardot p04 对齐):
 * 面包屑 + 大标题/元信息 + 目录/正文,页脚同分类上一篇/下一篇,
 * 右栏=在线人数/最新资讯(+公告推送说明)与登录态积分余额。
 */
export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const article = await getArticleBySlug(decodeURIComponent(params.slug));
  return { title: article ? `${article.title} · 老克塔` : "文章 · 老克塔" };
}

export default async function PostPage({
  params,
}: {
  params: { slug: string };
}) {
  const article = await getArticleBySlug(decodeURIComponent(params.slug));
  if (!article) notFound();
  const [{ html, toc }, adjacent, latest, status] = await Promise.all([
    renderMarkdown(article.bodyMd, { cdnHosts: await getCdnHosts() }),
    getAdjacentArticles(article),
    listLatestNews(5),
    getServerStatus(),
  ]);
  const published = article.publishedAt?.toISOString().slice(0, 10);

  return (
    <main className="container-site flex-1 py-6">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <article className="min-w-0">
          <nav aria-label="面包屑" className="mb-4 flex items-center gap-2 text-[13px]">
            <Link href="/" className="text-[#6482a3] hover:text-[#6fb7e0]">
              首页
            </Link>
            <span aria-hidden="true" className="text-[#6482a3]">
              ›
            </span>
            <Link
              href={`/${article.category.slug}`}
              className="text-[#93b2ce] hover:text-[#6fb7e0]"
            >
              {article.category.name}
            </Link>
          </nav>

          <header className="border-b border-[#22385a] pb-5">
            <h1 className="text-[32px] font-bold leading-[1.35] text-[#dcebf7]">
              {article.title}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[#6482a3]">
              {published && <span>{published}</span>}
              <span>{article.views} 次阅读</span>
              {article.tags.length > 0 && (
                <span className="flex flex-wrap gap-2">
                  {article.tags.map((t) => (
                    <span key={t.tag.slug} className="text-[#6eb7df]">
                      #{t.tag.name}
                    </span>
                  ))}
                </span>
              )}
            </p>
          </header>

          {toc.length > 0 && (
            <nav
              aria-label="目录"
              className="mt-6 rounded-xl border border-[#22385a] bg-[#0d1828] p-5"
            >
              <p className="mb-3 flex items-center gap-2.5 text-[14px] font-semibold text-[#a8d9f5]">
                <span
                  aria-hidden="true"
                  className="h-[14px] w-[4px] shrink-0 rounded-full bg-[#5ea3cc]"
                />
                目录
              </p>
              <ul className="grid gap-1.5 sm:grid-cols-2">
                {toc.map((item) => (
                  <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 16 }}>
                    <a
                      href={`#${item.id}`}
                      className="text-[13.5px] text-[#93b2ce] hover:text-[#6fb7e0]"
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <div
            className={MARKDOWN_BODY_CLS}
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {(adjacent.prev || adjacent.next) && (
            <footer className="mt-10 grid gap-3 border-t border-[#22385a] pt-5 sm:grid-cols-2">
              {adjacent.prev ? (
                <Link
                  href={`/post/${encodeURIComponent(adjacent.prev.slug)}`}
                  className="group rounded-xl border border-[#22385a] bg-[#13233a] px-4 py-3"
                >
                  <span className="text-[12px] text-[#6482a3]">← 上一篇</span>
                  <span className="mt-1 line-clamp-1 block text-[13.5px] text-[#93b2ce] group-hover:text-[#6fb7e0]">
                    {adjacent.prev.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {adjacent.next && (
                <Link
                  href={`/post/${encodeURIComponent(adjacent.next.slug)}`}
                  className="group rounded-xl border border-[#22385a] bg-[#13233a] px-4 py-3 sm:text-right"
                >
                  <span className="text-[12px] text-[#6482a3]">下一篇 →</span>
                  <span className="mt-1 line-clamp-1 block text-[13.5px] text-[#93b2ce] group-hover:text-[#6fb7e0]">
                    {adjacent.next.title}
                  </span>
                </Link>
              )}
            </footer>
          )}
        </article>

        <div className="space-y-5">
          <ArticleAside
            latest={latest}
            status={status}
            isAnnouncement={article.category.slug === "announcements"}
          />
          <SiteSidebar pageType="article" className="lg:w-auto" />
        </div>
      </div>

      <ViewCounter slug={article.slug} />
      <WowheadTooltips />
    </main>
  );
}
