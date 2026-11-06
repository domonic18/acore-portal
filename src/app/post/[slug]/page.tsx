import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAdjacentArticles, getArticleBySlug } from "@/server/services/content/articles";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { getCdnHosts, getConfig } from "@/lib/config";
import { MARKDOWN_BODY_CLS, PROMOTED_GUIDE_MAP } from "@/constants/content";
import { permanentRedirect } from "next/navigation";
import { SiteSidebar } from "@/components/site/sidebar/site-sidebar";
import { getSidebarView } from "@/server/services/sidebar/view";
import { ContentPanel } from "@/components/site/content-panel";
import { ArticleTocBlock, ArticleTocRail } from "@/components/content/article-toc";
import { ViewCounter } from "@/components/content/view-counter";
import { WowheadTooltips } from "@/components/content/wowhead-tooltips";
import { AnnouncementNoteCard } from "./announcement-note-card";

/**
 * 文章详情(T024,FR-210/211;2026-10 ardot p04 对齐):
 * 面包屑 + 大标题/元信息 + 目录/正文,页脚同分类上一篇/下一篇,
 * 右栏=在线人数/最新资讯(+公告推送说明)与登录态积分余额。
 * 正文区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
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
  const slug = decodeURIComponent(params.slug);
  // 教程类内容已升格为静态页:旧 /post/ 链接(站内快捷入口/存量外链)永续 308 跳转
  const promoted = PROMOTED_GUIDE_MAP[slug];
  if (promoted) permanentRedirect(promoted);
  const article = await getArticleBySlug(slug);
  if (!article) notFound();
  const [{ html, toc }, adjacent, sidebar, config] = await Promise.all([
    renderMarkdown(article.bodyMd, { cdnHosts: await getCdnHosts() }),
    getAdjacentArticles(article),
    getSidebarView("article"),
    getConfig(),
  ]);
  const published = article.publishedAt ? formatDate(article.publishedAt) : null;
  // 目录可见=页面级开关(文章 tocEnabled,null=跟随全局 content.tocEnabled)+正文有
  // h2-h4 标题;任一不满足保持两栏(空目录列会错置栅格轨道),
  // ArticleTocRail/Block 对空数组自身也不渲染
  const showToc = (article.tocEnabled ?? config.content.tocEnabled) && toc.length > 0;
  const gridCls = `grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]${
    showToc ? " xl:grid-cols-[200px_minmax(0,1fr)_320px]" : ""
  }`;

  return (
    <main className="container-site flex-1 py-6">
      <div className={gridCls}>
        <ArticleTocRail items={showToc ? toc : []} />
        <ContentPanel className="min-w-0 p-5 lg:p-6">
          <article className="min-w-0">
            <nav aria-label="面包屑" className="mb-4 flex items-center gap-2 text-[13px]">
              <Link href="/" className="text-muted hover:text-link">
                首页
              </Link>
              <span aria-hidden="true" className="text-muted">
                ›
              </span>
              <Link
                href={`/${article.category.slug}`}
                className="text-body hover:text-link"
              >
                {article.category.name}
              </Link>
            </nav>

            <header className="border-b border-line pb-5">
              <h1 className="text-[32px] font-bold leading-[1.35] text-heading">
                {article.title}
              </h1>
              <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-muted">
                {published && <span>{published}</span>}
                <span>{article.views} 次阅读</span>
                {article.tags.length > 0 && (
                  <span className="flex flex-wrap gap-2">
                    {article.tags.map((t) => (
                      <span key={t.tag.slug} className="text-link">
                        #{t.tag.name}
                      </span>
                    ))}
                  </span>
                )}
              </p>
            </header>

            <ArticleTocBlock items={showToc ? toc : []} />

            <div
              className={MARKDOWN_BODY_CLS}
              dangerouslySetInnerHTML={{ __html: html }}
            />

            {(adjacent.prev || adjacent.next) && (
              <footer className="mt-10 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
                {adjacent.prev ? (
                  <Link
                    href={`/post/${encodeURIComponent(adjacent.prev.slug)}`}
                    className="group rounded-xl border border-line bg-panel px-4 py-3"
                  >
                    <span className="text-[12px] text-muted">← 上一篇</span>
                    <span className="mt-1 line-clamp-1 block text-[13.5px] text-body group-hover:text-link">
                      {adjacent.prev.title}
                    </span>
                  </Link>
                ) : (
                  <span />
                )}
                {adjacent.next && (
                  <Link
                    href={`/post/${encodeURIComponent(adjacent.next.slug)}`}
                    className="group rounded-xl border border-line bg-panel px-4 py-3 sm:text-right"
                  >
                    <span className="text-[12px] text-muted">下一篇 →</span>
                    <span className="mt-1 line-clamp-1 block text-[13.5px] text-body group-hover:text-link">
                      {adjacent.next.title}
                    </span>
                  </Link>
                )}
              </footer>
            )}
          </article>
        </ContentPanel>

        {/* 右栏整列=SiteSidebar(在线人数/最新资讯/QQ 群/积分余额,后台按页面范围编排);
            公告类文章追加站内信推送提示卡(文章详情私有,内容驱动非页面级配置) */}
        <div className="space-y-5">
          <SiteSidebar pageType="article" {...sidebar} sticky className="lg:w-auto" />
          {article.category.slug === "announcements" && <AnnouncementNoteCard />}
        </div>
      </div>

      <ViewCounter slug={article.slug} />
      <WowheadTooltips />
    </main>
  );
}
