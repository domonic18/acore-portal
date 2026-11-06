import Link from "next/link";
import { ContentPanel } from "@/components/site/content-panel";
import { NavIcon } from "@/components/admin/nav-icons";
import { PinnedBadge, ThreadStatusBadge } from "@/components/forum/thread-badge";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { getCdnHosts } from "@/lib/config";
import { renderMarkdown } from "@/lib/markdown";
import {
  listForumBoards,
  listLatestForumThreads,
  listRecentForumReplies,
} from "@/server/services/forum/browse";

export const metadata = { title: "玩家论坛 · 老克塔" };

/** 版块列表(FR-219;2026-11-04 开放登录用户发帖,入口在版块页;p07 设计稿两栏) */
export default async function ForumPage() {
  const [rawBoards, latest, replies] = await Promise.all([
    listForumBoards(),
    listLatestForumThreads(5),
    listRecentForumReplies(5),
  ]);
  // #59:板块描述走与版块页头一致的 Markdown 白名单管线(#58:不再 line-clamp 截断)
  const cdnHosts = await getCdnHosts();
  const boards = await Promise.all(
    rawBoards.map(async (b) => ({
      ...b,
      descHtml: b.description ? (await renderMarkdown(b.description, { cdnHosts })).html : null,
    })),
  );

  return (
    <main className="container-site flex-1 py-6">
      {/* 页头入面板条(2026-11-03:面包屑/标题不再直压背景图) */}
      <div className="mb-5 rounded-xl border border-line bg-panel px-5 py-4">
        <nav aria-label="面包屑" className="mb-2.5 flex items-center gap-2 text-[11px] lg:text-[13.5px]">
          <Link href="/" className="text-muted hover:text-link">
            首页
          </Link>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
          <span className="text-body lg:text-num">玩家社区 · FORUM</span>
        </nav>
        <div className="flex flex-wrap items-center gap-3 lg:gap-3.5">
          <h1 className="text-[18px] font-bold leading-tight text-num lg:text-[30px] lg:text-heading">
            玩家论坛
          </h1>
          <span className="hidden text-[13.5px] text-muted lg:inline">
            注册用户可发帖回帖 · 版块讨论与工单浏览
          </span>
        </div>
        <p className="mt-1 text-[10px] text-muted lg:hidden">注册用户可发帖回帖</p>
      </div>

      <div>
        <ContentPanel className="p-4 lg:p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <section className="order-1 min-w-0 overflow-hidden rounded-xl border border-line bg-panel lg:order-none lg:flex-1">
              <div className="flex h-[50px] items-center gap-3 border-b border-line px-5">
                <span className="h-4 w-1 rounded-sm bg-link" aria-hidden="true" />
                <h2 className="text-[17px] font-semibold text-num">
                  版块（{boards.length}）
                </h2>
                <span className="ml-auto hidden text-[13px] text-muted sm:inline">
                  原站 bbPress 版块迁移
                </span>
              </div>

              {/* #57:列只留 版块/主题·回复/操作,最新动态不再混排在板块卡内 */}
              <div className="hidden grid-cols-[minmax(0,1.6fr)_110px_64px] gap-4 px-5 py-2.5 text-[12px] text-body lg:grid">
                <span>版块</span>
                <span>主题 · 回复</span>
                <span className="text-right">操作</span>
              </div>

              <ul>
                {boards.map((b) => (
                  <li key={b.slug} className="border-t border-line first:border-t-0">
                    <div className="grid grid-cols-1 gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1.6fr)_110px_64px] lg:items-center lg:gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl bg-panel-inset text-xl text-num"
                        >
                          {b.icon ? (
                            <NavIcon icon={b.icon} className="h-6 w-6" />
                          ) : (
                            b.name.slice(0, 1)
                          )}
                        </span>
                        <div className="min-w-0">
                          <Link
                            href={`/forum/${b.slug}`}
                            className="text-[17px] font-semibold text-heading hover:text-link"
                          >
                            {b.name}
                          </Link>
                          {b.descHtml && (
                            <div
                              data-testid={`board-desc-${b.slug}`}
                              className={`mt-1 text-[13px] leading-5 text-muted ${MARKDOWN_BODY_CLS}`}
                              dangerouslySetInnerHTML={{ __html: b.descHtml }}
                            />
                          )}
                          <p className="mt-1 text-[12px] text-muted lg:hidden">
                            {b.threadCount} 主题 · {b.replyCount} 回复
                          </p>
                        </div>
                      </div>

                      <div className="hidden lg:block">
                        <div className="text-[17px] text-body">{b.threadCount}</div>
                        <div className="text-[12.5px] text-muted">
                          主题 · {b.replyCount} 回复
                        </div>
                      </div>

                      <Link
                        href={`/forum/${b.slug}`}
                        className="hidden h-[26px] items-center justify-center rounded-full bg-link/12 px-3 text-[12px] text-num hover:bg-link/20 lg:inline-flex"
                      >
                        进入 →
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex flex-col gap-5 lg:w-[340px]">
            <aside className="order-2 flex flex-col">
              <section className="flex flex-1 flex-col overflow-hidden rounded-xl border border-line bg-panel">
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <span className="h-4 w-1 rounded-sm bg-danger" aria-hidden="true" />
                  <h2 className="text-[17px] font-semibold text-num">最新主题</h2>
                </div>
                <ul className="flex-1">
                  {latest.map((t) => (
                    <li
                      key={t.id.toString()}
                      className="border-t border-line first:border-t-0"
                    >
                      <Link
                        href={`/forum/thread/${t.id}`}
                        className="block px-5 py-3 transition-colors hover:bg-panel-strong"
                      >
                        <p className="flex items-start gap-1.5 text-[14px] leading-5 text-heading hover:text-link">
                          {t.pinned ? (
                            <PinnedBadge />
                          ) : (
                            <ThreadStatusBadge statusLabel={t.statusLabel} closedAt={t.closedAt} />
                          )}
                          <span className="min-w-0 flex-1 line-clamp-2">{t.title}</span>
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
                          <span className="truncate">{t.board.name}</span>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{t.authorName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="shrink-0">回复 {t.replyCount}</span>
                        </p>
                      </Link>
                    </li>
                  ))}
                  {latest.length === 0 && (
                    <li className="px-5 py-8 text-center text-[13px] text-muted">暂无主题。</li>
                  )}
                </ul>
              </section>
            </aside>

            <section className="order-1 rounded-xl border border-line bg-panel px-5 py-4">
              <div className="mb-2 flex items-center gap-3">
                <span className="h-4 w-1 rounded-sm bg-link" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold text-num">版规与说明</h2>
              </div>
              <ul className="space-y-1.5 text-[13px] leading-[1.9] text-body">
                <li>· 发帖 / 回帖面向注册用户开放；图片请通过发帖页上传（限论坛相册）</li>
                <li>· 申诉须附账号与封禁时间，处理结果同步「封号记录」公示</li>
                <li>· 举报须提交截图 / 录屏证据，恶意举报将被禁言</li>
                <li>· 问题反馈请注明客户端版本 / 复现步骤 / 订单号（如涉及商城）</li>
                <li>· 置顶 / 状态标签由版主与管理员维护</li>
              </ul>
            </section>

            <section
              data-testid="forum-recent-replies"
              className="order-3 rounded-xl border border-line bg-panel px-5 py-4"
            >
              <div className="mb-2 flex items-center gap-3">
                <span className="h-4 w-1 rounded-sm bg-link" aria-hidden="true" />
                <h2 className="text-[15px] font-semibold text-num">最近回复</h2>
              </div>
              <ul className="space-y-2.5 text-[14px]">
                {replies.map((r) => (
                  <li key={r.id} className="border-t border-line first:border-t-0">
                    <Link
                      href={`/forum/thread/${r.threadId}`}
                      className="mt-2 block line-clamp-2 text-[14px] text-heading hover:text-link"
                    >
                      {r.threadTitle}
                    </Link>
                    <p className="mt-0.5 flex items-center gap-2 text-[12.5px] text-muted">
                      <span className="truncate">{r.boardName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{r.authorName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="shrink-0">{r.floor} 楼</span>
                    </p>
                  </li>
                ))}
                {replies.length === 0 && (
                  <li className="py-4 text-center text-[13px] text-muted">暂无回复。</li>
                )}
              </ul>
            </section>
            </div>
          </div>
        </ContentPanel>
      </div>
    </main>
  );
}
