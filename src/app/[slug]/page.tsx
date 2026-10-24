import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CORE_PAGE_SLUGS } from "@/constants/content";
import { getPublishedPage } from "@/server/services/content/pages";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";

/**
 * 静态页根级兜底(T025,FR-210/R15):/{slug} 未被具名路由命中时落到这里;
 * 命中 published 静态页渲染,否则 notFound。RESERVED_SLUGS 保证保存侧不与
 * 功能路由冲突;generateStaticParams 列核心 5 页(layout 含 cookies,实际动态)。
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

export default async function ContentStaticPage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await getPublishedPage(params.slug);
  if (!page) notFound();
  const { html } = await renderMarkdown(page.bodyMd, { cdnHosts: await getCdnHosts() });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <article className="min-w-0 flex-1">
        <h1 className="border-b border-[#1e2a3d] pb-3 text-2xl font-bold text-[#e6d8a8]">
          {page.title}
        </h1>
        <div
          className={MARKDOWN_BODY_CLS}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
      <SiteSidebar pageType="page" />
    </main>
  );
}
