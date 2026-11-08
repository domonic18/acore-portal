import Link from "next/link";
import { listAdminArticles } from "@/server/services/content/admin";
import { ArticleDeleteButton } from "@/components/admin/article-actions";
import { AdminPager } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { buildPageHref } from "@/lib/pagination";

/**
 * 文章列表(T032,FR-215):q 标题搜索+状态筛选+分页 20/页(含 draft);
 * 行内编辑/删除;新建入口。
 */
export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: { page?: string; q?: string; status?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const q = searchParams.q || undefined;
  const status = searchParams.status === "draft" || searchParams.status === "published"
    ? searchParams.status
    : undefined;
  const { items, totalPages, total } = await listAdminArticles({ page, q, status });

  const pageHref = (p: number) => buildPageHref("/admin/articles", { q, status }, p);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">文章</h1>
        <form action="/admin/articles" method="get" className="flex items-center gap-2">
          <Input name="q" defaultValue={q ?? ""} placeholder="搜索标题…" className="w-44" />
          <Select name="status" defaultValue={status ?? ""} className="w-auto">
            <option value="">全部状态</option>
            <option value="published">已发布</option>
            <option value="draft">草稿</option>
          </Select>
          <Button type="submit" size="md">筛选</Button>
        </form>
        <ButtonLink href="/admin/articles/new" variant="primary">
          新建文章
        </ButtonLink>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          没有匹配的文章。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>标题</Th>
              <Th>分类</Th>
              <Th>状态</Th>
              <Th>阅读</Th>
              <Th>发布时间</Th>
              <Th>操作</Th>
            </tr>
          </THead>
          <tbody>
            {items.map((a) => (
              <Tr key={a.id}>
                <Td>
                  <Link
                    prefetch={false}
                    href={`/admin/articles/${a.id}`}
                    className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
                  >
                    {a.title}
                  </Link>
                  <span className="ml-2 font-mono text-xs text-[#6482a3]">{a.slug}</span>
                </Td>
                <Td className="text-[#93b2ce]">{a.categoryName}</Td>
                <Td>
                  <Badge tone={a.status === "published" ? "ok" : "muted"}>
                    {a.status === "published" ? "已发布" : "草稿"}
                  </Badge>
                </Td>
                <Td className="text-[#93b2ce]">{a.views}</Td>
                <Td className="whitespace-nowrap text-xs text-[#6482a3]">
                  {a.publishedAt ? a.publishedAt.slice(0, 10) : "—"}
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <Link
                      prefetch={false}
                      href={`/admin/articles/${a.id}`}
                      className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
                    >
                      编辑
                    </Link>
                    <ArticleDeleteButton id={a.id} title={a.title} />
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}

      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="篇"
        href={pageHref}
      />
    </div>
  );
}
