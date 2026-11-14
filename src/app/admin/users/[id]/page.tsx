import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getAdminUserDetail,
  listBadges,
} from "@/server/services/users-admin/admin";
import { POINT_TX_TYPE_LABEL } from "@/constants/points";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";
import { UserActions } from "@/components/admin/user-actions";
import { RoleAssign } from "@/components/admin/role-assign";
import { RoleBadge } from "@/components/admin/role-badge";
import { displayUserName, formatDate, formatDateTime } from "@/lib/format";

/** 用户详情(FR-130):余额/徽章/近 10 条流水+角色分配、手调与授予操作。 */
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-[#dcebf7]">{displayUserName(user)}</h1>
          <RoleBadge role={user.role} className="text-[13px]" />
          <span className="text-sm font-medium text-[#e8c877]">
            余额 {user.balance} 积分
          </span>
          <Link
            prefetch={false}
            href="/admin/users"
            className="rounded text-sm text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
          >
            ← 返回列表
          </Link>
        </div>
        {/* 角色分配:低频不可逆操作,放页头右侧,提权 admin 前二次确认 */}
        <RoleAssign userId={user.id.toString()} role={user.role} />
      </div>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-[#22385a] bg-[#13233a] p-4 text-sm md:grid-cols-4">
        <div>
          <dt className="text-[#6482a3]">昵称</dt>
          <dd className="text-[#dcebf7]">{user.nickname ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">用户名</dt>
          <dd className="font-mono text-[#dcebf7]">{user.username}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">邮箱</dt>
          <dd className="text-[#dcebf7]">{user.email}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">状态</dt>
          <dd className="text-[#dcebf7]">{user.status}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">WP 用户 ID</dt>
          <dd className="font-mono text-[#dcebf7]">{user.wpUserId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[#6482a3]">注册时间</dt>
          <dd className="text-[#dcebf7]">{formatDateTime(user.createdAt)}</dd>
        </div>
      </dl>

      <UserActions
        userId={user.id.toString()}
        badges={badges.map((b) => ({ id: b.id, name: `${b.name}(Lv.${b.level})` }))}
      />

      <section className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold text-[#dcebf7]">已获徽章</h2>
        {user.badges.length === 0 ? (
          <p className="text-sm text-[#6482a3]">暂无徽章。</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {user.badges.map((g) => (
              <li
                key={g.id}
                className="rounded-full border border-[#e8c877]/30 bg-[#e8c877]/10 px-3 py-1 text-sm text-[#e8c877]"
              >
                {g.name}(Lv.{g.level})
                <span className="ml-2 whitespace-nowrap text-xs text-[#6482a3]">
                  {formatDate(g.grantedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-[14px] font-semibold text-[#dcebf7]">最近流水(10 条)</h2>
        {user.recentTransactions.length === 0 ? (
          <p className="text-sm text-[#6482a3]">暂无流水。</p>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>类型</Th>
                <Th>变动</Th>
                <Th>变动后</Th>
                <Th>备注</Th>
                <Th>时间</Th>
              </tr>
            </THead>
            <tbody>
              {user.recentTransactions.map((t) => (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap text-[#dcebf7]">
                    {POINT_TX_TYPE_LABEL[t.type as keyof typeof POINT_TX_TYPE_LABEL] ?? t.type}
                  </Td>
                  <Td
                    className={`whitespace-nowrap font-mono ${
                      t.amount >= 0 ? "text-[#6ee7b7]" : "text-[#eda9a9]"
                    }`}
                  >
                    {t.amount >= 0 ? `+${t.amount}` : t.amount}
                  </Td>
                  <Td className="whitespace-nowrap text-[#dcebf7]">{t.balanceAfter}</Td>
                  <Td className="min-w-0 text-[#6482a3]">{t.remark ?? "—"}</Td>
                  <Td className="whitespace-nowrap text-xs text-[#6482a3]">
                    {formatDateTime(t.createdAt)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>
    </div>
  );
}
