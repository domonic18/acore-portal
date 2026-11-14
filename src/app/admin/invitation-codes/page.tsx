import { listInvitationCodes } from "@/server/services/users-admin/admin";
import {
  InvitationGenerateForm,
  InvitationStatusToggle,
} from "@/components/admin/invitation-admin";
import { AdminPager } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { buildPageHref } from "@/lib/pagination";
import { formatDate } from "@/lib/format";

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
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          暂无邀请码,先在上方批量生成。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>邀请码</Th>
              <Th>状态</Th>
              <Th>已用/上限</Th>
              <Th>使用者</Th>
              <Th>过期时间</Th>
              <Th>操作</Th>
            </tr>
          </THead>
          <tbody>
            {items.map((c) => {
              const effDisabled = c.status === "disabled" || c.expired || c.usedCount >= c.maxUses;
              return (
                <Tr key={c.id}>
                  <Td className="font-mono text-xs text-[#dcebf7]">{c.code}</Td>
                  <Td>
                    <Badge tone={effDisabled ? "muted" : "ok"}>
                      {c.status === "disabled"
                        ? "已停用"
                        : c.expired
                          ? "已过期"
                          : c.usedCount >= c.maxUses
                            ? "已用尽"
                            : "可用"}
                    </Badge>
                  </Td>
                  <Td className="text-[#93b2ce]">
                    {c.usedCount}/{c.maxUses}
                  </Td>
                  <Td className="text-xs text-[#93b2ce]">
                    {c.usedBy.length ? c.usedBy.join(", ") : "—"}
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-[#6482a3]">
                    {c.expiresAt ? formatDate(c.expiresAt) : "永久"}
                  </Td>
                  <Td>
                    <InvitationStatusToggle codeId={c.id} status={c.status} />
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="枚"
        href={(p) => buildPageHref("/admin/invitation-codes", {}, p)}
      />
    </div>
  );
}
