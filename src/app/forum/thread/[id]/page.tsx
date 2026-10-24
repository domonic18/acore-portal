import Link from "next/link";
import { notFound } from "next/navigation";
import { PinnedBadge, ThreadStatusBadge } from "@/app/_components/forum/thread-badge";
import { renderLegacyHtml } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import { FORUM_POST_PAGE_SIZE, incrementThreadViews } from "@/server/services/forum/browse";
import {
  getForumThread,
  listThreadPosts,
} from "@/server/services/forum/browse";

export const metadata = { title: "主题 · 老克塔论坛" };

function fmtDateTime(d: Date) {
  return d.toISOString().slice(0, 16).replace("T", " ");
}

/** 楼层阅读(FR-219):floor asc 20/页,主贴楼层 1 首页置顶;每次访问 viewCount+1(R2) */
export default async function ForumThreadPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { page?: string };
}) {
  const id = Number.parseInt(params.id, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const thread = await getForumThread(BigInt(id));
  if (!thread) notFound();
  await incrementThreadViews(thread.id);

  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, total, pageSize } = await listThreadPosts({
    threadId: thread.id,
    page,
    pageSize: FORUM_POST_PAGE_SIZE,
  });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) =>
    p > 1 ? `/forum/thread/${thread.id}?page=${p}` : `/forum/thread/${thread.id}`;
  const cdnHosts = await getCdnHosts();
  const floors = await Promise.all(
    items.map(async (p) => ({ ...p, html: await renderLegacyHtml(p.contentHtml, { cdnHosts }) })),
  );

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-4 p-4">
      <header className="border-b border-[#1e2a3d] pb-3">
        <p className="text-xs text-[#5d6b80]">
          <Link href="/forum" className="hover:text-[#e6d8a8]">
            论坛
          </Link>
          {" / "}
          <Link href={`/forum/${thread.board.slug}`} className="hover:text-[#e6d8a8]">
            {thread.board.name}
          </Link>
        </p>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-[#e6d8a8]">
          {thread.pinned && <PinnedBadge />}
          <ThreadStatusBadge statusLabel={thread.statusLabel} closedAt={thread.closedAt} />
          <span>{thread.title}</span>
        </h1>
        <p className="mt-1 text-xs text-[#5d6b80]">
          {thread.authorName} · {fmtDateTime(thread.createdAt)} · {thread.viewCount} 浏览 ·{" "}
          {thread.replyCount} 回复
          {thread.closedAt && " · 已关闭(不可回复)"}
        </p>
      </header>

      <ul className="flex flex-col gap-3">
        {floors.map((p) => (
          <li
            key={p.id}
            className="rounded border border-[#1e2a3d] bg-[#101827]/60 p-4"
          >
            <div className="mb-2 flex items-baseline justify-between text-xs text-[#5d6b80]">
              <span>
                <span className="font-medium text-[#8fa0b8]">{p.authorName}</span>
                <span className="ml-2">{fmtDateTime(p.createdAt)}</span>
              </span>
              <span className={p.floor === 1 ? "text-[#c9a227]" : undefined}>
                {p.floor === 1 ? "楼主" : `${p.floor} 楼`}
              </span>
            </div>
            {/* 迁移层仅图片重写;XSS 白名单在 renderLegacyHtml 收口(research R4) */}
            <div
              className="forum-post-body text-sm leading-6 text-[#c7d2e0] [&_a]:text-[#6fb7e0] [&_a:hover]:text-[#e6d8a8] [&_blockquote]:border-l-2 [&_blockquote]:border-[#3a4a63] [&_blockquote]:pl-3 [&_blockquote]:text-[#8fa0b8] [&_code]:rounded [&_code]:bg-[#1e2a3d] [&_code]:px-1 [&_img]:max-w-full [&_p]:my-2"
              dangerouslySetInnerHTML={{ __html: p.html }}
            />
          </li>
        ))}
      </ul>

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
