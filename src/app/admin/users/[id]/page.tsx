import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdminUserDetail,
  listBadges,
} from "@/server/services/users-admin/admin";
import { POINT_TX_TYPE_LABEL } from "@/constants/points";
import { UserActions } from "@/components/admin/user-actions";

/** 用户详情(FR-130):余额/徽章/近 10 条流水+手调与授予操作。 */
export default async function AdminUserDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const [user, badges] = await Promise.all([
    getAdminUserDetail(BigInt(id)),
    listBadges(),
  ]);
  if (!user) notFound();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{user.username}</h1>
        <span className="rounded bg-gray-800 px-2 py-0.5 text-sm text-gray-300">{user.role}</span>
        <span className="text-sm text-amber-400">
          余额 {user.pointAccount?.balance ?? 0} 积分
        </span>
        <Link href="/admin/users" className="text-sm text-blue-400 hover:underline">
          ← 返回列表
        </Link>
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded border border-gray-800 p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-gray-500">邮箱</dt>
          <dd className="text-gray-300">{user.email}</dd>
        </div>
        <div>
          <dt className="text-gray-500">状态</dt>
          <dd className="text-gray-300">{user.status}</dd>
        </div>
        <div>
          <dt className="text-gray-500">WP 用户 ID</dt>
          <dd className="font-mono text-gray-300">{user.wpUserId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">注册时间</dt>
          <dd className="text-gray-300">{new Date(user.createdAt).toLocaleString("zh-CN")}</dd>
        </div>
      </dl>

      <UserActions
        userId={user.id.toString()}
        badges={badges.map((b) => ({ id: b.id, name: `${b.name}(Lv.${b.level})` }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">已获徽章</h2>
        {user.badgeGrantsReceived.length === 0 ? (
          <p className="text-sm text-gray-500">暂无徽章。</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {user.badgeGrantsReceived.map((g) => (
              <li
                key={g.id}
                className="rounded border border-amber-800 bg-amber-950/50 px-3 py-1 text-sm text-amber-300"
              >
                {g.badge.name}(Lv.{g.badge.level})
                <span className="ml-2 text-xs text-gray-500">
                  {new Date(g.createdAt).toLocaleDateString("zh-CN")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">最近流水(10 条)</h2>
        {user.recentTransactions.length === 0 ? (
          <p className="text-sm text-gray-500">暂无流水。</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="py-2 pr-3 font-normal">类型</th>
                <th className="py-2 pr-3 font-normal">变动</th>
                <th className="py-2 pr-3 font-normal">变动后</th>
                <th className="py-2 pr-3 font-normal">备注</th>
                <th className="py-2 pr-3 font-normal">时间</th>
              </tr>
            </thead>
            <tbody>
              {user.recentTransactions.map((t) => (
                <tr key={t.id} className="border-b border-gray-900">
                  <td className="py-2 pr-3 text-gray-300">
                    {POINT_TX_TYPE_LABEL[t.type] ?? t.type}
                  </td>
                  <td
                    className={`py-2 pr-3 font-mono ${
                      t.amount >= 0 ? "text-green-400" : "text-red-400"
                    }`}
                  >
                    {t.amount >= 0 ? `+${t.amount}` : t.amount}
                  </td>
                  <td className="py-2 pr-3 text-gray-300">{t.balanceAfter}</td>
                  <td className="py-2 pr-3 text-gray-500">{t.remark ?? "—"}</td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {new Date(t.createdAt).toLocaleString("zh-CN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
