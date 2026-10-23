import { prisma } from "@/lib/db";
import { requireSession } from "@/server/session-guard";
import { PointsPager, type PointTx } from "./pager";

const PAGE_SIZE = 10;

/** 契约:余额真实数据(不可得→错误态不伪造 0)+ 流水分页(首页 RSC,翻页走 API) */
export default async function PointsPage() {
  const session = await requireSession();
  const userId = BigInt(session.userId);

  const account = await prisma.pointAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });
  if (!account) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">积分</h1>
        <p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          积分数据暂不可用,请稍后重试。
        </p>
      </main>
    );
  }

  const total = await prisma.pointTransaction.count({ where: { userId } });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows = await prisma.pointTransaction.findMany({
    where: { userId },
    orderBy: { id: "desc" },
    take: PAGE_SIZE,
    select: { id: true, type: true, amount: true, balanceAfter: true, remark: true, createdAt: true },
  });
  const initial: PointTx[] = rows.map((t) => ({
    id: t.id.toString(),
    type: t.type,
    amount: t.amount,
    balanceAfter: t.balanceAfter,
    remark: t.remark,
    createdAt: t.createdAt.toISOString(),
  }));

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">积分</h1>
      <section className="inline-flex flex-col rounded border border-gray-800 px-6 py-4">
        <span className="text-3xl font-bold">{account.balance}</span>
        <span className="text-sm text-gray-400">当前余额</span>
      </section>
      <PointsPager initial={initial} page={1} totalPages={totalPages} />
    </main>
  );
}
