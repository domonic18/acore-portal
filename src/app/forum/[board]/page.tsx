import Link from "next/link";
import { notFound } from "next/navigation";
import { ForumPagination } from "@/app/_components/forum/forum-pagination";
import { PinnedBadge, ThreadStatusBadge } from "@/app/_components/forum/thread-badge";
import { FORUM_PAGE_SIZE } from "@/constants/forum";
import {
  getForumBoardBySlug,
  listBoardThreads,
} from "@/server/services/forum/browse";

export const metadata = { title: "版块 · 老克塔论坛" };

function fmtShortDate(d: Date) {
  return d.toISOString().slice(5, 10);
}

type ThreadRow = Awaited<ReturnType<typeof listBoardThreads>>["items"][number];

function ThreadRowBody({ thread }: { thread: ThreadRow }) {
  return (
    <>
      <span className="flex shrink-0 items-center gap-1.5">
        {thread.pinned && <PinnedBadge />}
        <ThreadStatusBadge statusLabel={thread.statusLabel} closedAt={thread.closedAt} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[15px] font-medium leading-6 text-[#dcebf7] group-hover:text-[#6fb7e0]">
          {thread.title}
        </span>
        <span className="mt-0.5 block text-[12px] text-[#6482a3] lg:hidden">
          {thread.replyCount} 回复 · {thread.viewCount} 查看 · {thread.authorName} ·{" "}
          {fmtShortDate(thread.lastPostAt)}
        </span>
      </span>
      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-[#a8d9f5] lg:block">
        {thread.replyCount}
      </span>
      <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-[#6482a3] lg:block">
        {thread.viewCount}
      </span>
      <span className="hidden w-[150px] shrink-0 truncate text-right text-[13.5px] text-[#6482a3] lg:block">
        {thread.authorName} · {fmtShortDate(thread.lastPostAt)}
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
  const board = await getForumBoardBySlug(params.board);
  if (!board) notFound();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, total, pageSize } = await listBoardThreads({
    boardId: board.id,
    page,
    pageSize: FORUM_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    p > 1 ? `/forum/${board.slug}?page=${p}` : `/forum/${board.slug}`;
  const pinned = page === 1 ? items.filter((t) => t.pinned) : [];
  const rest = items.filter((t) => !t.pinned);

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <nav aria-label="面包屑" className="mb-3 flex items-center gap-2 text-[12px] lg:text-[13.5px]">
        <Link href="/forum" className="text-[#6482a3] hover:text-[#6fb7e0]">
          论坛
        </Link>
        <span aria-hidden="true" className="text-[#6482a3]">
          /
        </span>
        <span className="text-[#a8d9f5]">{board.name}</span>
      </nav>

      <header className="mb-4 flex items-center gap-4 rounded-xl border border-[#22385a] bg-[#13233a] px-5 py-4">
        <span className="h-[38px] w-1 rounded-sm bg-[#6fb7e0]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold text-[#dcebf7]">{board.name}</h1>
          <p className="mt-1.5 text-[13px] text-[#93b2ce] lg:text-[13.5px]">
            {board.description ?? "版块说明暂无"}
            <span className="text-[#6482a3]"> · 共 {total} 主题</span>
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4">
        {pinned.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a]">
            <div className="flex items-center gap-2.5 px-5 py-3.5">
              <span className="h-4 w-[5px] rounded-sm bg-[#e8c877]" aria-hidden="true" />
              <h2 className="text-[16px] font-semibold text-[#e8c877]">置顶公告</h2>
            </div>
            <ul>
              {pinned.map((t) => (
                <li key={t.id.toString()} className="border-t border-[#22385a]">
                  <Link
                    href={`/forum/thread/${t.id}`}
                    className="group flex items-start gap-3.5 px-5 py-3"
                  >
                    <span className="mt-0.5">
                      <PinnedBadge />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[15px] text-[#dcebf7] group-hover:text-[#6fb7e0]">
                        {t.title}
                      </span>
                      <span className="mt-0.5 block text-[12px] text-[#6482a3] lg:hidden">
                        {t.replyCount} 回复 · {t.viewCount} 查看 · {t.authorName} ·{" "}
                        {fmtShortDate(t.lastPostAt)}
                      </span>
                    </span>
                    <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-[#a8d9f5] lg:block">
                      {t.replyCount}
                    </span>
                    <span className="hidden w-[60px] shrink-0 text-right text-[13.5px] text-[#6482a3] lg:block">
                      {t.viewCount}
                    </span>
                    <span className="hidden w-[150px] shrink-0 truncate text-right text-[13.5px] text-[#6482a3] lg:block">
                      {t.authorName} · {fmtShortDate(t.lastPostAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="overflow-hidden rounded-xl border border-[#22385a] bg-[#13233a]">
          <div className="flex items-center gap-2.5 px-5 py-3.5">
            <span className="h-4 w-[5px] rounded-sm bg-[#6fb7e0]" aria-hidden="true" />
            <h2 className="text-[16px] font-semibold text-[#a8d9f5]">全部主题</h2>
            <span className="ml-auto hidden text-[12px] text-[#6482a3] sm:inline">
              回复 / 查看 / 最新回复
            </span>
          </div>

          {rest.length === 0 ? (
            <p className="border-t border-[#22385a] py-12 text-center text-[13px] text-[#6482a3]">
              暂无主题。
            </p>
          ) : (
            <ul>
              {rest.map((t) => (
                <li key={t.id.toString()} className="border-t border-[#22385a]">
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

          <ForumPagination
            page={page}
            totalPages={totalPages}
            total={total}
            href={href}
          />
        </section>
      </div>
    </main>
  );
}
