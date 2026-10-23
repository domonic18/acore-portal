import { prisma } from "@/lib/db";
import { requireSession } from "@/server/session-guard";
import { characterAvatar } from "@/constants/characters";
import { ACCOUNT_NAV } from "@/constants/navigation";
import { formatDateTime } from "@/lib/format";
import {
  GameDbError,
  listOwnCharacters,
  resolveGameAccountId,
} from "@/server/services/characters";

/** 契约:概览 = user + 角色计数 + 最近积分流水(503 局部错误,不白屏) */
export default async function AccountOverviewPage() {
  const session = await requireSession();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: BigInt(session.userId) },
    select: { id: true, username: true, nickname: true, email: true },
  });

  const recent = await prisma.pointTransaction.findMany({
    where: { userId: user.id },
    orderBy: { id: "desc" },
    take: 5,
    select: { id: true, type: true, amount: true, remark: true, createdAt: true },
  });

  let characterCount: number | null = null;
  try {
    const accountId = await resolveGameAccountId(user.username);
    characterCount =
      accountId === null ? 0 : (await listOwnCharacters(accountId)).length;
  } catch (err) {
    if (!(err instanceof GameDbError)) throw err;
  }

  const avatar = characterAvatar(user.nickname ?? user.username, 0);

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">账号总览</h1>

      <section className="flex items-center gap-4 rounded border border-gray-800 p-4">
        <span
          aria-hidden
          className="flex h-12 w-12 items-center justify-center rounded-full text-xl font-bold text-gray-900"
          style={{ backgroundColor: avatar.color }}
        >
          {avatar.initial}
        </span>
        <div className="flex flex-col gap-0.5 text-sm">
          <span className="text-base font-semibold">{user.nickname ?? user.username}</span>
          <span className="text-gray-400">用户名:{user.username}</span>
          <span className="text-gray-400">邮箱:{user.email}</span>
        </div>
        <div className="ml-auto flex gap-6 text-sm">
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold">{characterCount ?? "—"}</span>
            <span className="text-gray-400">角色数</span>
          </div>
          <div className="flex flex-col items-center">
            <span className="text-xl font-bold">{recent.length}</span>
            <span className="text-gray-400">最近流水</span>
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
          <p className="text-sm text-gray-400">暂无积分流水。</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recent.map((t) => (
              <li key={t.id} className="flex justify-between rounded border border-gray-800 px-3 py-2">
                <span>{t.remark ?? t.type}</span>
                <span className="flex gap-4">
                  <span className={t.amount >= 0 ? "text-green-400" : "text-red-400"}>
                    {t.amount >= 0 ? "+" : ""}
                    {t.amount}
                  </span>
                  <span className="text-gray-400">{formatDateTime(t.createdAt.toISOString())}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <a href="/account/points" className="text-sm text-blue-400 hover:text-blue-300">
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
              className="rounded border border-gray-800 px-3 py-4 text-center hover:border-gray-600"
            >
              {item.label}
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
