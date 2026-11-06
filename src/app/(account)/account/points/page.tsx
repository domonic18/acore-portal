import { requireSession } from "@/server/session-guard";
import { getPointsPage } from "@/server/services/points/view";
import { PointsPager } from "./pager";

/** 契约:余额真实数据(不可得→错误态不伪造 0)+ 流水分页(首页 RSC,翻页走 API) */
export default async function PointsPage() {
  const session = await requireSession();
  const data = await getPointsPage(BigInt(session.userId), 1);

  if (data.balance === null) {
    return (
      <main className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold">积分</h1>
        <p role="alert" className="rounded border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-400">
          积分数据暂不可用,请稍后重试。
        </p>
      </main>
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">积分</h1>
      <section className="inline-flex flex-col rounded-md border border-line px-6 py-4">
        <span className="text-3xl font-bold">{data.balance}</span>
        <span className="text-sm text-body">当前余额</span>
      </section>
      <PointsPager
        initial={data.transactions}
        page={data.page}
        totalPages={data.totalPages}
      />
    </main>
  );
}
