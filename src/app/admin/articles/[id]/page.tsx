import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleForm } from "@/components/admin/article-form";
import {
  getAdminArticle,
  listAdminArticleCategories,
  listAdminTags,
} from "@/server/services/content/admin";

/** 文章编辑回填(T032):全字段(含正文 MD 与标签)回填表单 */
export default async function AdminArticleEditPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [article, categories, tags] = await Promise.all([
    getAdminArticle(BigInt(id)),
    listAdminArticleCategories(),
    listAdminTags(),
  ]);
  if (!article) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">编辑文章</h1>
        <Link href={`/post/${article.slug}`} className="text-sm text-blue-400 hover:underline">
          前台查看 ↗
        </Link>
        <Link href="/admin/articles" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>
      <ArticleForm
        initial={{
          id: article.id,
          title: article.title,
          slug: article.slug,
          categoryId: article.categoryId,
          excerpt: article.excerpt ?? "",
          bodyMd: article.bodyMd,
          status: article.status,
          tagIds: article.tags.map((t) => t.id),
        }}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
