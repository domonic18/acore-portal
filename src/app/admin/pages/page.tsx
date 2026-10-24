import Link from "next/link";
import { listAdminPages } from "@/server/services/content/admin";
import { PageDeleteButton } from "@/components/admin/page-actions";

/** 静态页列表(T032,FR-216):含 draft;行内编辑/删除;新建入口 */
export default async function AdminPagesPage() {
  const items = await listAdminPages();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">静态页</h1>
        <Link
          href="/admin/pages/new"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          新建静态页
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          暂无静态页。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">标题</th>
              <th className="py-2 pr-3 font-normal">slug</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">排序</th>
              <th className="py-2 pr-3 font-normal">更新时间</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-gray-900">
                <td className="py-2 pr-3">
                  <Link href={`/admin/pages/${p.id}`} className="text-blue-400 hover:underline">
                    {p.title}
                  </Link>
                </td>
                <td className="py-2 pr-3 font-mono text-xs text-gray-400">/{p.slug}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      p.status === "published"
                        ? "bg-green-950 text-green-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {p.status === "published" ? "已发布" : "草稿"}
                  </span>
                </td>
                <td className="py-2 pr-3 text-gray-400">{p.sortOrder}</td>
                <td className="py-2 pr-3 text-gray-500">{p.updatedAt.slice(0, 10)}</td>
                <td className="flex gap-3 py-2 pr-3">
                  <Link href={`/admin/pages/${p.id}`} className="text-blue-400 hover:underline">
                    编辑
                  </Link>
                  <PageDeleteButton id={p.id} title={p.title} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
