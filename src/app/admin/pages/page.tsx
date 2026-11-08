import Link from "next/link";
import { listAdminPages } from "@/server/services/content/admin";
import { PageDeleteButton } from "@/components/admin/page-actions";
import { CORE_PAGE_SLUGS } from "@/constants/content";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/** 静态页列表(T032,FR-216):含 draft;行内编辑/删除;新建入口 */
export default async function AdminPagesPage() {
  const items = await listAdminPages();
  const linkCls = `rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">静态页</h1>
        <ButtonLink href="/admin/pages/new" variant="primary">
          新建静态页
        </ButtonLink>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          暂无静态页。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>标题</Th>
              <Th>slug</Th>
              <Th>状态</Th>
              <Th>排序</Th>
              <Th>更新时间</Th>
              <Th>操作</Th>
            </tr>
          </THead>
          <tbody>
            {items.map((p) => {
              const core = CORE_PAGE_SLUGS.includes(p.slug);
              return (
                <Tr key={p.id}>
                  <Td className="whitespace-nowrap">
                    <Link prefetch={false} href={`/admin/pages/${p.id}`} className={linkCls}>
                      {p.title}
                    </Link>
                  </Td>
                  <Td className="font-mono text-xs text-[#93b2ce]">/{p.slug}</Td>
                  <Td>
                    <Badge tone={p.status === "published" ? "ok" : "muted"}>
                      {p.status === "published" ? "已发布" : "草稿"}
                    </Badge>
                  </Td>
                  <Td className="text-[#93b2ce]">{p.sortOrder}</Td>
                  <Td className="whitespace-nowrap text-xs text-[#6482a3]">{p.updatedAt.slice(0, 10)}</Td>
                  <Td>
                    <div className="flex items-center gap-2">
                      <Link prefetch={false} href={`/admin/pages/${p.id}`} className={linkCls}>
                        编辑
                      </Link>
                      {core ? (
                        // 核心页被站内固定链接引用,不可删除(issue #94)
                        <Badge tone="muted" title="核心静态页:站内固定链接引用,不可删除">
                          核心
                        </Badge>
                      ) : (
                        <PageDeleteButton id={p.id} title={p.title} />
                      )}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
