import Link from "next/link";
import { listAdminUsers } from "@/server/services/users-admin/admin";
import { displayUserName } from "@/lib/format";

/** 用户列表(FR-130):用户名/昵称/邮箱模糊搜索+分页;余额来自 point_account。 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { query?: string; page?: string };
}) {
  const query = searchParams.query?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { users, totalPages, total } = await listAdminUsers({ query, page });

  const pageHref = (p: number) =>
    `/admin/users?page=${p}${query ? `&query=${encodeURIComponent(query)}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">用户</h1>
      <form method="GET" action="/admin/users" className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">用户名/昵称/邮箱搜索</span>
          <input
            name="query"
            defaultValue={query}
            placeholder="回车搜索"
            className="w-72 rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          搜索
        </button>
        {query && (
          <Link href="/admin/users" className="text-sm text-gray-400 hover:underline">
            清除
          </Link>
        )}
      </form>

      {users.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          没有匹配的用户。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">用户名</th>
              <th className="py-2 pr-3 font-normal">邮箱</th>
              <th className="py-2 pr-3 font-normal">角色</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">积分</th>
              <th className="py-2 pr-3 font-normal">注册时间</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-900">
                <td className="py-2 pr-3">
                  <Link href={`/admin/users/${u.id}`} className="text-blue-400 hover:underline">
                    {displayUserName(u)}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-gray-400">{u.email}</td>
                <td className="py-2 pr-3 text-gray-400">{u.role}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`rounded px-2 py-0.5 text-xs ${
                      u.status === "active"
                        ? "bg-green-950 text-green-400"
                        : "bg-red-950 text-red-400"
                    }`}
                  >
                    {u.status}
                  </span>
                </td>
                <td className="py-2 pr-3 text-amber-400">{u.balance ?? "—"}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">
                  {new Date(u.createdAt).toLocaleDateString("zh-CN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 人</span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-4">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-blue-400 hover:underline">
                上一页
              </Link>
            ) : (
              <span className="text-gray-600">上一页</span>
            )}
            <span>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-blue-400 hover:underline">
                下一页
              </Link>
            ) : (
              <span className="text-gray-600">下一页</span>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}
