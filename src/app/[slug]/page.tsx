import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CORE_PAGE_SLUGS, MARKDOWN_TYPOGRAPHY_CLS, SYSTEM_GENERATED_PAGE_SLUGS, TUTORIAL_ANCHOR_ALIASES } from "@/constants/content";
import { getPublishedPage } from "@/server/services/content/pages";
import { resolveProgressionPosition } from "@/server/services/progression/progression";
import { getSiteMapPageView } from "@/server/services/seo/sitemap";
import { renderMarkdown } from "@/lib/markdown";
import { formatDate } from "@/lib/format";
import { getCdnHosts, getConfig } from "@/lib/config";
import { SiteSidebar } from "@/components/site/sidebar/site-sidebar";
import { getSidebarView } from "@/server/services/sidebar/view";
import { ContentPanel } from "@/components/site/content-panel";
import { ArticleTocBlock, ArticleTocRail } from "@/components/content/article-toc";
import { SiteMapSection } from "@/components/content/site-map-section";

/**
 * 静态页根级兜底(T025,FR-210/R15):/{slug} 未被具名路由命中时落到这里;
 * 命中 published 静态页渲染,否则 notFound。RESERVED_SLUGS 保证保存侧不与
 * 功能路由冲突;generateStaticParams 列核心 6 页(layout 含 cookies,实际动态)。
 * 2026-10 ardot p02 对齐:面包屑 + 大标题/更新日期 + 正文分节排版。
 * 正文区套 ContentPanel:页面背景图为全站装饰层,文字不可直接压在背景图上。
 * /sitemap 追加动态站点地图分组(正文为空的种子页此前只有标题,不像网站地图)。
 */
export async function generateStaticParams() {
  return CORE_PAGE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const page = await getPublishedPage(params.slug);
  return { title: page ? `${page.title} · 老克塔` : "老克塔" };
}

/** 正文排版:分节标题竖条/免责声明提示块/步骤引用卡/图片域内缩放(p02 设计稿) */
const PAGE_BODY_CLS = [
  "mt-6 max-w-none text-[14.5px] leading-[1.95] text-[#93b2ce]",
  "[&_h1]:hidden",
  "[&_h2]:mt-9 [&_h2]:scroll-mt-24 [&_h2]:border-l-[3px] [&_h2]:border-[#e8c877] [&_h2]:pl-3 [&_h2]:text-[18px] [&_h2]:font-bold [&_h2]:leading-7 [&_h2]:text-[#dcebf7]",
  "[&_h3]:mt-6 [&_h3]:scroll-mt-24 [&_h3]:text-[16px] [&_h3]:font-semibold [&_h3]:text-[#dcebf7]",
  "[&_p]:my-3",
  "[&_a]:text-[#6fb7e0] [&_a:hover]:text-[#e8c877]",
  "[&_blockquote]:my-4 [&_blockquote]:rounded-xl [&_blockquote]:border [&_blockquote]:border-[#22385a] [&_blockquote]:bg-[#13233a] [&_blockquote]:px-4 [&_blockquote]:py-3 [&_blockquote]:text-[#93b2ce]",
  "[&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-[#22385a] [&_blockquote_img]:mt-1",
  "[&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#22385a] [&_td]:px-2.5 [&_td]:py-1.5 [&_th]:border [&_th]:border-[#22385a] [&_th]:bg-[#0d1828] [&_th]:px-2.5 [&_th]:py-1.5",
  "[&_h2[data-section=note]]:mt-10 [&_h2[data-section=note]]:border-[#e8c877] [&_h2[data-section=note]]:text-[#e8c877]",
  "[&_h2[data-section=note]~ul]:rounded-r-lg [&_h2[data-section=note]~ul]:border-l [&_h2[data-section=note]~ul]:border-[#e8c877]/25 [&_h2[data-section=note]~ul]:bg-[#e8c877]/5 [&_h2[data-section=note]~ul]:px-4 [&_h2[data-section=note]~ul]:py-3",
  MARKDOWN_TYPOGRAPHY_CLS,
].join(" ");

/** 静态页:面包屑 + 标题/更新日期 + 正文;about 追加「当前阶段」联动(p02 设计稿) */
export default async function ContentStaticPage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await getPublishedPage(params.slug);
  if (!page) notFound();
  const cdnHosts = await getCdnHosts();
  const [{ html, toc }, position, siteMapGroups, sidebar, config] = await Promise.all([
    renderMarkdown(page.bodyMd, {
      cdnHosts,
      sections: true,
      sectionAnchors:
        params.slug === "tutorial" ? TUTORIAL_ANCHOR_ALIASES : undefined,
    }),
    params.slug === "about" ? resolveProgressionPosition() : Promise.resolve(null),
    SYSTEM_GENERATED_PAGE_SLUGS.includes(params.slug)
      ? getSiteMapPageView()
      : Promise.resolve(null),
    getSidebarView("page"),
    getConfig(),
  ]);

  // 目录可见=页面级开关(页面 tocEnabled,null=跟随全局 content.tocEnabled)+正文有
  // h2-h4 标题;无目录保持两栏(空目录列会错置栅格轨道),
  // ArticleTocRail/Block 对空数组自身也不渲染
  const showToc = (page.tocEnabled ?? config.content.tocEnabled) && toc.length > 0;
  const gridCls = `grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_256px]${
    showToc ? " xl:grid-cols-[200px_minmax(0,1fr)_256px]" : ""
  }`;

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <div className={gridCls}>
        <ArticleTocRail items={showToc ? toc : []} />
        <ContentPanel className="p-5 lg:p-6">
          <nav
            aria-label="面包屑"
            className="mb-3 flex flex-wrap items-center gap-2 text-[11px] lg:text-[13.5px]"
          >
            <Link href="/" className="text-[#6482a3] hover:text-[#6fb7e0]">
              首页
            </Link>
            <span aria-hidden="true" className="text-[#6482a3]">
              ›
            </span>
            <span className="text-[#93b2ce]">{page.title}</span>
          </nav>

          <article className="min-w-0">
            <header className="border-b border-[#22385a] pb-4">
              <h1 className="text-[26px] font-bold leading-tight text-[#dcebf7] lg:text-[32px]">
                {page.title}
              </h1>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-[#6482a3] lg:text-[13px]">
                <span>更新：{formatDate(page.updatedAt)}</span>
                {position?.current && (
                  <span>
                    当前阶段：
                    <Link
                      href={`/progression#node-${position.current.id}`}
                      className="text-[#a8d9f5] hover:text-[#e8c877]"
                    >
                      {position.current.title}
                    </Link>
                  </span>
                )}
              </p>
            </header>
            <ArticleTocBlock items={showToc ? toc : []} />
            <div
              className={PAGE_BODY_CLS}
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {siteMapGroups && <SiteMapSection groups={siteMapGroups} />}
          </article>
        </ContentPanel>
        <SiteSidebar pageType="page" {...sidebar} sticky />
      </div>
    </main>
  );
}
