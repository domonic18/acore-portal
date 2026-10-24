import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getArticleBySlug } from "@/server/services/content/articles";
import { renderMarkdown } from "@/lib/markdown";
import { SiteSidebar } from "@/app/_components/sidebar/sidebar";
import { ViewCounter } from "@/components/content/view-counter";
import { WowheadTooltips } from "@/components/content/wowhead-tooltips";

/**
 * 文章详情(T024,FR-210/211):bodyMd 经 lib/markdown 渲染( sanitize+高亮+
 * TOC+wowhead 短代码);TOC 锚点侧栏;views 水合后上报+Wowhead 浮窗。
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
  const { html, toc } = await renderMarkdown(article.bodyMd);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-4 lg:flex-row">
      <article className="min-w-0 flex-1">
        <header className="border-b border-[#1e2a3d] pb-4">
          <nav className="mb-2 text-xs text-[#5d6b80]">
            <Link href={`/${article.category.slug}`} className="hover:text-[#c9a227]">
              {article.category.name}
            </Link>
          </nav>
          <h1 className="text-2xl font-bold text-[#e6d8a8]">{article.title}</h1>
          <p className="mt-2 text-xs text-[#5d6b80]">
            {article.publishedAt?.toISOString().slice(0, 10)} · {article.views} 次阅读
            {article.tags.length > 0 && (
              <>
                {" · "}
                {article.tags.map((t) => (
                  <span key={t.tag.slug} className="mr-1 text-[#8fa0b8]">
                    #{t.tag.name}
                  </span>
                ))}
              </>
            )}
          </p>
        </header>

        {toc.length > 0 && (
          <nav
            aria-label="目录"
            className="mt-4 rounded border border-[#1e2a3d] bg-[#0d1728] p-4 text-sm"
          >
            <p className="mb-2 font-medium text-[#e6d8a8]">目录</p>
            <ul className="space-y-1">
              {toc.map((item) => (
                <li key={item.id} style={{ paddingLeft: (item.depth - 2) * 16 }}>
                  <a
                    href={`#${item.id}`}
                    className="text-[#8fa0b8] hover:text-[#e6d8a8]"
                  >
                    {item.text}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div
          className="prose-invert mt-6 max-w-none space-y-4 text-sm leading-7 text-[#c7d2e0] [&_h2]:border-b [&_h2]:border-[#1e2a3d] [&_h2]:pb-1 [&_h2]:pt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-[#e6d8a8] [&_h3]:pt-3 [&_h3]:text-lg [&_h3]:font-bold [&_h3]:text-[#e6d8a8] [&_h4]:font-bold [&_h4]:text-[#c7d2e0] [&_img]:max-w-full [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-[#0d1728] [&_pre]:p-3 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-[#1e2a3d] [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-[#1e2a3d] [&_th]:px-2 [&_th]:py-1"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
      <SiteSidebar pageType="article" />
      <ViewCounter slug={article.slug} />
      <WowheadTooltips />
    </main>
  );
}
