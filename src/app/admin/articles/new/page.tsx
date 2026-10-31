import Link from "next/link";
import { ArticleForm } from "@/components/admin/article-form";
import { listAdminArticleCategories, listAdminTags } from "@/server/services/content/admin";

/** 文章新建(T032):分类/标签来自 article-taxonomies 列表接口同源查询 */
export default async function AdminArticleNewPage() {
  const [categories, tags] = await Promise.all([listAdminArticleCategories(), listAdminTags()]);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">新建文章</h1>
        <Link href="/admin/articles" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>
      <ArticleForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        tags={tags.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
