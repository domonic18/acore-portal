import Link from "next/link";
import { listAdminUsers } from "@/server/services/users-admin/admin";
import { RoleSelect } from "@/components/admin/role-select";
import { AdminPager } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableEmpty, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { displayUserName } from "@/lib/format";
import { buildPageHref } from "@/lib/pagination";

const ROLE_TABS = [
  { value: "", label: "全部" },
  { value: "admin", label: "admin" },
  { value: "moderator", label: "moderator" },
  { value: "user", label: "user" },
] as const;

/** 用户列表(FR-130):用户名/昵称/邮箱模糊搜索+角色筛选+分页;行内分配角色(改后吊销目标会话)。 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { query?: string; role?: string; page?: string };
}) {
  const query = searchParams.query?.trim() ?? "";
  const role = searchParams.role ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { users, totalPages, total } = await listAdminUsers({ query, role, page });

  const pageHref = (p: number) =>
    buildPageHref("/admin/users", { query: query || undefined, role: role || undefined }, p);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">用户</h1>
      <form method="GET" action="/admin/users" className="flex items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">用户名/昵称/邮箱搜索</span>
          <Input
            name="query"
            defaultValue={query}
            placeholder="回车搜索"
            className="w-72"
          />
        </label>
        {role && <input type="hidden" name="role" value={role} />}
        <Button type="submit" variant="primary">
          搜索
        </Button>
        {query && (
          <Link
            prefetch={false}
            href="/admin/users"
            className={`rounded text-sm text-[#6482a3] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
          >
            清除
          </Link>
        )}
      </form>

      <nav className="flex items-center gap-2 text-sm" aria-label="角色筛选">
        {ROLE_TABS.map((t) =>
          t.value === role ? (
            <span
              key={t.value || "all"}
              className="rounded-md border border-[#6fb7e0]/50 bg-[#6fb7e0]/10 px-3 py-1 font-semibold text-[#a8d9f5]"
            >
              {t.label}
            </span>
          ) : (
            <Link
              key={t.value || "all"}
              prefetch={false}
              href={`/admin/users${t.value ? `?role=${t.value}` : ""}`}
              className={`rounded-md border border-transparent px-3 py-1 text-[#93b2ce] transition hover:bg-[#13233a] hover:text-[#dcebf7] ${FOCUS_RING}`}
            >
              {t.label}
            </Link>
          ),
        )}
      </nav>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
          没有匹配的用户。
        </p>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>用户名</Th>
              <Th>邮箱</Th>
              <Th>角色</Th>
              <Th>状态</Th>
              <Th>积分</Th>
              <Th>注册时间</Th>
            </tr>
          </THead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>
                  <Link
                    prefetch={false}
                    href={`/admin/users/${u.id}`}
                    className="rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60"
                  >
                    {displayUserName(u)}
                  </Link>
                </Td>
                <Td className="text-[#93b2ce]">{u.email}</Td>
                <Td>
                  <RoleSelect userId={u.id} role={u.role} />
                </Td>
                <Td>
                  <Badge tone={u.status === "active" ? "ok" : "danger"}>{u.status}</Badge>
                </Td>
                <Td className="text-[#e8c877]">{u.balance ?? "—"}</Td>
                <Td className="text-xs text-[#6482a3]">
                  {new Date(u.createdAt).toLocaleDateString("zh-CN")}
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
        unit="人"
        href={pageHref}
      />
    </div>
  );
}
