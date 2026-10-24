import Link from "next/link";
import { notFound } from "next/navigation";
import { PageForm } from "@/components/admin/page-form";
import { getAdminPage } from "@/server/services/content/admin";

/** 静态页编辑回填(T032) */
export default async function AdminPageEditPage({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const page = await getAdminPage(BigInt(id));
  if (!page) notFound();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">编辑静态页</h1>
        <Link href={`/${page.slug}`} className="text-sm text-blue-400 hover:underline">
          前台查看 ↗
        </Link>
        <Link href="/admin/pages" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>
      <PageForm
        initial={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          bodyMd: page.bodyMd,
          status: page.status,
          sortOrder: page.sortOrder,
        }}
      />
    </div>
  );
}
