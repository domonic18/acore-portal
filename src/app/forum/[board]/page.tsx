import Link from "next/link";
import { notFound } from "next/navigation";
import { PinnedBadge, ThreadStatusBadge } from "@/app/_components/forum/thread-badge";
import { FORUM_PAGE_SIZE } from "@/constants/forum";
import {
  getForumBoardBySlug,
  listBoardThreads,
} from "@/server/services/forum/browse";

export const metadata = { title: "版块 · 老克塔论坛" };

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** 主题列表(FR-219):pinned desc + lastPostAt desc,20/页 */
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
  const href = (p: number) => (p > 1 ? `/forum/${board.slug}?page=${p}` : `/forum/${board.slug}`);

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="border-b border-[#1e2a3d] pb-3">
        <p className="text-xs text-[#5d6b80]">
          <Link href="/forum" className="hover:text-[#e6d8a8]">
            论坛
          </Link>
          {" / "}
          <span className="text-[#8fa0b8]">{board.name}</span>
        </p>
        <h1 className="text-2xl font-bold text-[#e6d8a8]">
          {board.name}
          <span className="ml-2 text-sm font-normal text-[#5d6b80]">共 {total} 主题</span>
        </h1>
        {board.description && <p className="mt-1 text-sm text-[#8fa0b8]">{board.description}</p>}
      </header>

      {items.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#5d6b80]">暂无主题。</p>
      ) : (
        <ul className="divide-y divide-[#1e2a3d]">
          {items.map((t) => (
            <li key={t.id} className="flex items-baseline gap-3 py-3">
              <span className="flex shrink-0 items-center gap-1.5">
                {t.pinned && <PinnedBadge />}
                <ThreadStatusBadge statusLabel={t.statusLabel} closedAt={t.closedAt} />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  href={`/forum/thread/${t.id}`}
                  className="text-base font-medium text-[#c7d2e0] hover:text-[#e6d8a8]"
                >
                  {t.title}
                </Link>
                <span className="ml-2 text-xs text-[#5d6b80]">{t.authorName}</span>
              </span>
              <span className="shrink-0 text-xs text-[#5d6b80]">
                {t.replyCount} 回复 · {t.viewCount} 浏览 · {fmtDate(t.lastPostAt)}
              </span>
            </li>
          ))}
        </ul>
      )}

      <nav aria-label="分页" className="flex items-center justify-between pt-2 text-sm">
        {page > 1 ? (
          <Link href={href(page - 1)} className="text-[#c9a227] hover:text-[#e6d8a8]">
            ← 上一页
          </Link>
        ) : (
          <span />
        )}
        <span className="text-[#5d6b80]">
          第 {page} / {totalPages} 页
        </span>
        {page < totalPages ? (
          <Link href={href(page + 1)} className="text-[#c9a227] hover:text-[#e6d8a8]">
            下一页 →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </main>
  );
}
