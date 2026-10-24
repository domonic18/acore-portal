import Link from "next/link";
import { listInvitationCodes } from "@/server/services/users-admin/admin";
import {
  InvitationGenerateForm,
  InvitationStatusToggle,
} from "@/components/admin/invitation-admin";

/**
 * 邀请码后台(M1 遗留能力落地):批量生成+列表(状态/已用/使用者)+启停;
 * 注册侧消费仍后置(spec Assumptions)。
 */
export default async function AdminInvitationCodesPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, totalPages, total } = await listInvitationCodes({ page });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">邀请码</h1>

      <InvitationGenerateForm />

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          暂无邀请码,先在上方批量生成。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">邀请码</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">已用/上限</th>
              <th className="py-2 pr-3 font-normal">使用者</th>
              <th className="py-2 pr-3 font-normal">过期时间</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c) => {
              const effDisabled = c.status === "disabled" || c.expired || c.usedCount >= c.maxUses;
              return (
                <tr key={c.id} className="border-b border-gray-900">
                  <td className="py-2 pr-3 font-mono text-xs text-gray-200">{c.code}</td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-2 py-0.5 text-xs ${
                        effDisabled
                          ? "bg-gray-800 text-gray-500"
                          : "bg-green-950 text-green-400"
                      }`}
                    >
                      {c.status === "disabled"
                        ? "已停用"
                        : c.expired
                          ? "已过期"
                          : c.usedCount >= c.maxUses
                            ? "已用尽"
                            : "可用"}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-gray-400">
                    {c.usedCount}/{c.maxUses}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-400">
                    {c.usedBy.length ? c.usedBy.join(", ") : "—"}
                  </td>
                  <td className="py-2 pr-3 text-xs text-gray-500">
                    {c.expiresAt ? new Date(c.expiresAt).toLocaleDateString("zh-CN") : "永久"}
                  </td>
                  <td className="py-2 pr-3">
                    <InvitationStatusToggle codeId={c.id} status={c.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 枚</span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-4">
            {page > 1 ? (
              <Link href={`/admin/invitation-codes?page=${page - 1}`} className="text-blue-400 hover:underline">
                上一页
              </Link>
            ) : (
              <span className="text-gray-600">上一页</span>
            )}
            <span>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={`/admin/invitation-codes?page=${page + 1}`} className="text-blue-400 hover:underline">
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
