import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPanel } from "@/components/site/content-panel";
import { ForumPagination } from "@/components/forum/forum-pagination";
import { PinnedBadge, ThreadStatusBadge } from "@/components/forum/thread-badge";
import { FORUM_PAGE_SIZE } from "@/constants/pagination";
import { formatShortDate } from "@/lib/format";
import { paginate } from "@/lib/pagination";
import { getForumBoardBySlug, listBoardThreads } from "@/server/services/forum/browse";
import { getServerSession } from "@/server/session-guard";
import { ButtonLink } from "@/components/ui/button";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import { MARKDOWN_BODY_CLS } from "@/constants/content";

export const metadata = { title: "版块 · 老克塔论坛" };

type ThreadRow = Awaited<ReturnType<typeof listBoardThreads>>["items"][number];

function ThreadRowBody({ thread }: { thread: ThreadRow }) {
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        {thread.pinned && <PinnedBadge />}
        <ThreadStatusBadge statusLabel={thread.statusLabel} closedAt={thread.closedAt} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-6 text-heading group-hover:text-link">
          {thread.title}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted lg:hidden">
          {thread.replyCount} 回复 · {thread.viewCount} 查看 · {thread.authorName} ·{" "}
          {formatShortDate(thread.lastPostAt)}
        </span>
      </span>
      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-num lg:block">
        {thread.replyCount}
      </span>
      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-muted lg:block">
        {thread.viewCount}
      </span>
      <span className="hidden w-[150px] shrink-0 truncate text-right text-[13.5px] text-muted lg:block">
        {thread.authorName} · {formatShortDate(thread.lastPostAt)}
      </span>
    </>
  );
}

/** 主题列表(FR-219):pinned desc + lastPostAt desc,20/页;p07 设计稿分区置顶 */
export default async function ForumBoardPage({
  params,
  searchParams,
}: {
  params: { board: string };
  searchParams: { page?: string };
}) {
  const session = await getServerSession();
  const board = await getForumBoardBySlug(params.board);
  if (!board) notFound();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, total, pageSize } = await listBoardThreads({
    boardId: board.id,
    page,
    pageSize: FORUM_PAGE_SIZE,
  });
  const { totalPages } = paginate(total, page, pageSize);
  const href = (p: number) => (p > 1 ? `/forum/${board.slug}?page=${p}` : `/forum/${board.slug}`);
  const pinned = page === 1 ? items.filter((t) => t.pinned) : [];
  const rest = items.filter((t) => !t.pinned);

  const descHtml = board.description
    ? (
        await renderMarkdown(board.description, { cdnHosts: await getCdnHosts() })
      ).html
    : null;

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <ContentPanel className="p-4 lg:p-5">
        <nav
          aria-label="面包屑"
          className="mb-3 flex items-center gap-2 text-[12px] lg:text-[13.5px]"
        >
          <Link href="/forum" className="text-muted hover:text-link">
            论坛
          </Link>
          <span aria-hidden="true" className="text-muted">
            /
          </span>
          <span className="text-num">{board.name}</span>
        </nav>

        <header className="mb-4 rounded-xl border border-line bg-panel px-5 py-4">
          <div className="flex items-start gap-4">
            <span className="h-[38px] w-1 rounded-sm bg-link" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h1 className="text-[19px] font-bold text-heading">{board.name}</h1>
              {descHtml ? (
                <div
                  className={`mt-1.5 text-[13px] ${MARKDOWN_BODY_CLS}`}
                  dangerouslySetInnerHTML={{ __html: descHtml }}
                />
              ) : (
                <p className="mt-1.5 text-[13px] text-body">版块说明暂无</p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[12.5px] text-muted">共 {total} 主题</p>
                {session ? (
                  <ButtonLink href={`/forum/${board.slug}/new`} size="sm">
                    发帖
                  </ButtonLink>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(`/forum/${board.slug}/new`)}`}
                    className="text-[12px] text-link hover:underline"
                  >
                    登录后可发帖
                  </Link>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-4">
          {pinned.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-line bg-panel">
              <div className="flex items-center gap-2.5 px-5 py-3.5">
                <span className="h-4 w-[5px] rounded-sm bg-highlight" aria-hidden="true" />
                <h2 className="text-[16px] font-semibold text-highlight">置顶公告</h2>
              </div>
              <ul>
                {pinned.map((t) => (
                  <li key={t.id.toString()} className="border-t border-line">
                    <Link
                      href={`/forum/thread/${t.id}`}
                      className="group flex items-start gap-3.5 px-5 py-3"
                    >
                      <span className="mt-0.5">
                        <PinnedBadge />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[15px] text-heading group-hover:text-link">
                          {t.title}
                        </span>
                        <span className="mt-0.5 block text-[12px] text-muted lg:hidden">
                          {t.replyCount} 回复 · {t.viewCount} 查看 · {t.authorName} ·{" "}
                          {formatShortDate(t.lastPostAt)}
                        </span>
                      </span>
                      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-num lg:block">
                        {t.replyCount}
                      </span>
                      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-muted lg:block">
                        {t.viewCount}
                      </span>
                      <span className="hidden w-[150px] shrink-0 truncate text-right text-[13.5px] text-muted lg:block">
                        {t.authorName} · {formatShortDate(t.lastPostAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-line bg-panel">
            <div className="flex items-center gap-2.5 px-5 py-3.5">
              <span className="h-4 w-[5px] rounded-sm bg-link" aria-hidden="true" />
              <h2 className="text-[16px] font-semibold text-num">全部主题</h2>
              <span className="ml-auto hidden text-[12px] text-muted sm:inline">
                回复 / 查看 / 最新回复
              </span>
            </div>

            {rest.length === 0 ? (
              <p className="border-t border-line py-12 text-center text-[13px] text-muted">
                暂无主题。
              </p>
            ) : (
              <ul>
                {rest.map((t) => (
                  <li key={t.id.toString()} className="border-t border-line">
                    <Link
                      href={`/forum/thread/${t.id}`}
                      className="group flex items-start gap-3.5 px-5 py-3"
                    >
                      <ThreadRowBody thread={t} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}

            <ForumPagination page={page} totalPages={totalPages} total={total} href={href} />
          </section>
        </div>
      </ContentPanel>
    </main>
  );
}
