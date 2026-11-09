import { requireSession } from "@/server/session-guard";
import { ACCOUNT_NAV } from "@/constants/navigation";
import { formatDateTime } from "@/lib/format";
import { getAccountOverview } from "@/server/services/account/overview";
import { UserAvatar } from "@/components/site/user-avatar";

/** 契约:概览 = user + 角色计数 + 最近积分流水(503 局部错误,不白屏) */
export default async function AccountOverviewPage() {
  const session = await requireSession();
  const { user, characterCount, recentTransactions: recent } =
    await getAccountOverview(BigInt(session.userId));

  const displayName = user.nickname || user.username;

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">账号总览</h1>

      {/* 窄屏纵向排版(2026-11-09 用户反馈:窄屏下信息行被统计块挤到折行):
          桌面 md+ 仍为「头像+信息 | 统计」一行 */}
      <section className="flex flex-col gap-4 rounded-md border border-line p-4 md:flex-row md:items-center">
        <div className="flex items-start gap-4 md:min-w-0 md:flex-1">
          <UserAvatar name={displayName} className="h-12 w-12 text-xl" />
          <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
            <span className="truncate text-base font-semibold">{displayName}</span>
            <dl className="flex flex-col gap-0.5">
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-body">用户名:</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere]">{user.username}</dd>
              </div>
              {/* #43:长邮箱优先自然边界断行,不在单词中间硬拆(break-words 仍会把长 token 从中间截断) */}
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-body">邮箱:</dt>
                <dd className="min-w-0 [overflow-wrap:anywhere] [word-break:keep-all]">
                  {user.email}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="flex gap-6 whitespace-nowrap text-sm md:ml-auto">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold">{characterCount ?? "—"}</span>
            <span className="text-body">角色数</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold">{recent.length}</span>
            <span className="text-body">最近流水</span>
          </div>
        </div>
      </section>
      {characterCount === null && (
        <p role="alert" className="text-sm text-amber-400">
          游戏数据暂时不可用,角色数与角色页稍后重试。
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">最近积分流水</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-body">暂无积分流水。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex justify-between rounded-md border border-line px-3 py-2">
                <span>{t.remark ?? t.type}</span>
                <span className="flex gap-4">
                  <span className={t.amount >= 0 ? "text-green-400" : "text-red-400"}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </span>
                  <span className="text-body">{formatDateTime(t.createdAt.toISOString())}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <a href="/account/points" className="text-sm text-link hover:text-num">
          查看全部积分 →
        </a>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">功能入口</h2>
        <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
          {ACCOUNT_NAV.filter((n) => n.href !== "/account/overview").map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="rounded-md border border-line px-3 py-4 text-center hover:border-link"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
