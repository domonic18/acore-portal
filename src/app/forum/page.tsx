import Link from "next/link";
import { PinnedBadge, ThreadStatusBadge } from "@/app/_components/forum/thread-badge";
import {
  listForumBoards,
  listLatestForumThreads,
} from "@/server/services/forum/browse";

export const metadata = { title: "玩家论坛 · 老克塔" };

function fmtShortDate(d: Date) {
  return d.toISOString().slice(5, 10);
}

/** 版块列表(FR-219;Q1 完全只读——本页零发帖入口;p07 设计稿两栏) */
export default async function ForumPage() {
  const [boards, latest] = await Promise.all([
    listForumBoards(),
    listLatestForumThreads(5),
  ]);

  return (
    <main className="flex-1 pb-10">
      <section className="relative hidden h-[250px] overflow-hidden border-b border-[#1b2f4c] bg-[#0a1220] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_22%_18%,rgba(111,183,224,0.2),transparent_55%),radial-gradient(ellipse_at_82%_120%,rgba(232,200,119,0.12),transparent_52%)]" />
        <div className="container-site relative flex h-full flex-col justify-center gap-2.5">
          <span className="inline-flex w-fit items-center rounded-full bg-[#6fb7e0]/15 px-3 py-1 text-[12.5px] text-[#a8d9f5]">
            玩家社区 · FORUM
          </span>
          <h1 className="text-[36px] font-bold leading-tight text-[#f2f8fd]">玩家论坛</h1>
          <p className="text-[14.5px] text-[#93b2ce]">
            存量社区归档 · 版块讨论与工单浏览 · 只读模式
          </p>
        </div>
      </section>

      <div className="container-site pt-4 lg:hidden">
        <nav aria-label="面包屑" className="mb-2 flex items-center gap-2 text-[11px]">
          <Link href="/" className="text-[#6482a3]">
            首页
          </Link>
          <span aria-hidden="true" className="text-[#6482a3]">
            ›
          </span>
          <span className="text-[#93b2ce]">玩家社区 · FORUM</span>
        </nav>
        <h1 className="text-xl font-bold text-[#dcebf7]">玩家论坛</h1>
        <p className="mt-1 text-[12px] text-[#6482a3]">存量社区归档 · 只读浏览</p>
      </div>

      <div className="container-site mt-4 grid items-start gap-5 lg:mt-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <section className="order-2 overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a] lg:order-none lg:col-start-1 lg:row-start-1">
          <div className="flex h-[50px] items-center gap-3 border-b border-[#22385a] px-5">
            <span className="h-4 w-1 rounded-sm bg-[#6fb7e0]" aria-hidden="true" />
            <h2 className="text-[17px] font-semibold text-[#a8d9f5]">
              版块（{boards.length}）
            </h2>
            <span className="ml-auto hidden text-[13px] text-[#6482a3] sm:inline">
              原站 bbPress 版块 · 只读浏览
            </span>
          </div>

          <div className="hidden grid-cols-[minmax(0,1.3fr)_110px_minmax(0,1fr)_64px] gap-4 px-5 py-2.5 text-[12px] text-[#93b2ce] lg:grid">
            <span>版块</span>
            <span>主题 · 回复</span>
            <span>最新动态</span>
            <span className="text-right">操作</span>
          </div>

          <ul>
            {boards.map((b) => (
              <li key={b.slug} className="border-t border-[#22385a] first:border-t-0">
                <div className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.3fr)_110px_minmax(0,1fr)_64px] lg:items-center lg:gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl bg-[#0d1828] text-xl text-[#a8d9f5]"
                    >
                      {b.name.slice(0, 1)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/forum/${b.slug}`}
                        className="text-[17px] font-semibold text-[#dcebf7] hover:text-[#6fb7e0]"
                      >
                        {b.name}
                      </Link>
                      {b.description && (
                        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-[#6482a3]">
                          {b.description}
                        </p>
                      )}
                      <p className="mt-1 text-[12px] text-[#6482a3] lg:hidden">
                        {b.threadCount} 主题 · {b.replyCount} 回复
                      </p>
                    </div>
                  </div>

                  <div className="hidden lg:block">
                    <div className="text-[17px] text-[#93b2ce]">{b.threadCount}</div>
                    <div className="text-[12.5px] text-[#6482a3]">
                      主题 · {b.replyCount} 回复
                    </div>
                  </div>

                  <div className="min-w-0 border-t border-[#22385a] pt-2.5 lg:border-0 lg:pt-0">
                    {b.latestThread ? (
                      <>
                        <Link
                          href={`/forum/thread/${b.latestThread.id}`}
                          className="line-clamp-1 text-[13px] text-[#93b2ce] hover:text-[#a8d9f5]"
                        >
                          {b.latestThread.title}
                        </Link>
                        <p className="mt-0.5 truncate text-[12.5px] text-[#6482a3]">
                          回复：{b.latestThread.authorName} ·{" "}
                          {fmtShortDate(b.latestThread.lastPostAt)}
                        </p>
                      </>
                    ) : (
                      <span className="text-[12.5px] text-[#6482a3]">暂无主题</span>
                    )}
                  </div>

                  <Link
                    href={`/forum/${b.slug}`}
                    className="hidden h-[26px] items-center justify-center rounded-full bg-[#6fb7e0]/12 px-3 text-[12px] text-[#a8d9f5] hover:bg-[#6fb7e0]/20 lg:inline-flex"
                  >
                    进入 →
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="order-1 lg:order-none lg:col-start-2 lg:row-start-1">
          <section className="overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a]">
            <div className="flex items-center gap-3 px-5 py-3.5">
              <span className="h-4 w-1 rounded-sm bg-[#eda9a9]" aria-hidden="true" />
              <h2 className="text-[17px] font-semibold text-[#a8d9f5]">最新主题</h2>
            </div>
            <ul>
              {latest.map((t) => (
                <li key={t.id.toString()} className="border-t border-[#22385a] first:border-t-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-5 py-3">
                    <Link
                      href={`/forum/thread/${t.id}`}
                      className="min-w-0 flex-1 truncate text-[14px] text-[#dcebf7] hover:text-[#6fb7e0]"
                    >
                      {t.title}
                    </Link>
                    {t.pinned ? (
                      <PinnedBadge />
                    ) : (
                      <ThreadStatusBadge
                        statusLabel={t.statusLabel}
                        closedAt={t.closedAt}
                      />
                    )}
                    <span className="hidden w-[72px] shrink-0 truncate text-[13px] text-[#6482a3] sm:block">
                      {t.board.name}
                    </span>
                    <span className="hidden w-[88px] shrink-0 truncate text-[13px] text-[#6482a3] sm:block">
                      {t.authorName}
                    </span>
                    <span className="shrink-0 text-[13px] text-[#6482a3]">
                      回复 {t.replyCount}
                    </span>
                  </div>
                </li>
              ))}
              {latest.length === 0 && (
                <li className="px-5 py-8 text-center text-[13px] text-[#6482a3]">
                  暂无主题。
                </li>
              )}
            </ul>
          </section>
        </aside>

        <section className="order-3 rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4 lg:order-none lg:col-start-2 lg:row-start-2">
          <div className="mb-2 flex items-center gap-3">
            <span className="h-4 w-1 rounded-sm bg-[#6fb7e0]" aria-hidden="true" />
            <h2 className="text-[15px] font-semibold text-[#a8d9f5]">版规与说明</h2>
          </div>
          <ul className="space-y-1.5 text-[13px] leading-[1.9] text-[#93b2ce]">
            <li>· 论坛为存量社区归档，仅提供浏览；发帖 / 回帖 / 上传图片已停用</li>
            <li>· 申诉须附账号与封禁时间，处理结果同步「封号记录」公示</li>
            <li>· 举报须提交截图 / 录屏证据，恶意举报将被禁言</li>
            <li>· 问题反馈请注明客户端版本 / 复现步骤 / 订单号（如涉及商城）</li>
            <li>· 置顶 / 状态标签由版主与管理员维护</li>
          </ul>
        </section>
      </div>
    </main>
  );
}
