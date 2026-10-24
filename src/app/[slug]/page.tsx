import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CORE_PAGE_SLUGS } from "@/constants/content";
import { getPublishedPage } from "@/server/services/content/pages";
import { renderMarkdown } from "@/lib/markdown";
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
  const { html } = await renderMarkdown(page.bodyMd);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <article className="min-w-0 flex-1">
        <h1 className="border-b border-[#1e2a3d] pb-3 text-2xl font-bold text-[#e6d8a8]">
          {page.title}
        </h1>
        <div
          className="prose-invert mt-4 max-w-none space-y-4 text-sm leading-7 text-[#c7d2e0] [&_h2]:border-b [&_h2]:border-[#1e2a3d] [&_h2]:pb-1 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#e6d8a8] [&_h3]:pt-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#e6d8a8] [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[#0d1728] [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#1e2a3d] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#1e2a3d] [&_th]:px-2 [&_th]:py-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
      <SiteSidebar pageType="page" />
    </main>
  );
}
