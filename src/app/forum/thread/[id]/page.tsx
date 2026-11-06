import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentPanel } from "@/components/site/content-panel";
import { ForumPagination } from "@/components/forum/forum-pagination";
import { PinnedBadge, ThreadStatusBadge } from "@/components/forum/thread-badge";
import { ModeratorActions } from "./moderator-actions";
import { renderLegacyHtml, renderMarkdown } from "@/lib/markdown";
import { formatDateTimeShort } from "@/lib/format";
import { getCdnHosts } from "@/lib/config";
import { getServerSession } from "@/server/session-guard";
import { FORUM_POST_PAGE_SIZE } from "@/constants/pagination";
import { FORUM_POST_BODY_CLS } from "@/constants/content";
import { PostActions } from "@/components/forum/post-actions";
import { ReplyForm } from "@/components/forum/reply-form";
import { incrementThreadViews } from "@/server/services/forum/browse";
import { paginate } from "@/lib/pagination";
import { getForumThread, listThreadPosts } from "@/server/services/forum/browse";

export const metadata = { title: "主题 · 老克塔论坛" };

const ROLE_LABEL = {
  user: "成员",
  moderator: "版主",
  admin: "管理员",
} as const;

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
  const { totalPages } = paginate(total, page, pageSize);
  const href = (p: number) =>
    p > 1 ? `/forum/thread/${thread.id}?page=${p}` : `/forum/thread/${thread.id}`;
  const cdnHosts = await getCdnHosts();
  // 渲染判别:存量帖(legacyWpPostId 非空)走 HTML 白名单;新帖(#34)正文为 Markdown
  const floors = await Promise.all(
    items.map(async (p) => ({
      ...p,
      html:
        p.legacyWpPostId !== null
          ? await renderLegacyHtml(p.contentHtml, { cdnHosts })
          : (await renderMarkdown(p.contentHtml, { cdnHosts })).html,
    })),
  );
  const session = await getServerSession();
  const canModerate = session?.role === "moderator" || session?.role === "admin";

  return (
    <main className="container-site flex-1 py-5 lg:py-6">
      <ContentPanel className="p-4 lg:p-5">
        <nav
          aria-label="面包屑"
          className="mb-3 flex flex-wrap items-center gap-2 text-[11px] lg:text-[13.5px]"
        >
          <Link href="/forum" className="text-muted hover:text-link">
            论坛
          </Link>
          <span aria-hidden="true" className="text-muted">
            /
          </span>
          <Link
            href={`/forum/${thread.board.slug}`}
            className="text-muted hover:text-link"
          >
            {thread.board.name}
          </Link>
          <span aria-hidden="true" className="text-muted">
            /
          </span>
          <span className="line-clamp-1 text-body">{thread.title}</span>
        </nav>

        <header className="mb-4 border-b border-line pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            {thread.pinned && <PinnedBadge />}
            <ThreadStatusBadge statusLabel={thread.statusLabel} closedAt={thread.closedAt} />
            <h1 className="text-xl font-bold leading-8 text-heading lg:text-[24px]">
              {thread.title}
            </h1>
          </div>
          <p className="mt-2 text-[12px] text-muted lg:text-[13px]">
            {thread.authorName} · {formatDateTimeShort(thread.createdAt)} · {thread.replyCount} 回复
            · {thread.viewCount} 查看 · {thread.board.name}
            {thread.closedAt && " · 已关闭"}
          </p>
        </header>

        {canModerate && (
          <div className="mb-4">
            <ModeratorActions
              threadId={thread.id.toString()}
              pinned={thread.pinned}
              closed={thread.closedAt != null}
              statusLabel={thread.statusLabel}
              boardSlug={thread.board.slug}
            />
          </div>
        )}

        <section className="flex flex-col gap-3">
          {floors.map((p) => {
            const role = p.authorUser?.role ?? "user";
            const privileged = role === "admin" || role === "moderator";
            return (
              <article
                key={p.id.toString()}
                className="rounded-xl border border-line bg-panel p-4 lg:p-5"
              >
                <div className="flex gap-3 lg:gap-4">
                  <span
                    aria-hidden="true"
                    className={`grid h-[40px] w-[40px] shrink-0 place-items-center rounded-lg text-base lg:h-[46px] lg:w-[46px] lg:text-lg ${
                      privileged ? "bg-highlight/12 text-highlight" : "bg-panel-inset text-num"
                    }`}
                  >
                    {p.authorName.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line pb-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span
                          className={`text-[14px] font-semibold ${
                            privileged ? "text-highlight" : "text-heading"
                          }`}
                        >
                          {p.authorName}
                        </span>
                        <span className="text-[11.5px] text-muted">{ROLE_LABEL[role]}</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
                        <span className="text-body">
                          {p.floor === 1 ? "楼主" : `${p.floor} 楼`}
                        </span>
                        {canModerate && p.floor !== 1 && (
                          <PostActions threadId={thread.id.toString()} postId={p.id.toString()} />
                        )}
                        {" · "}
                        {formatDateTimeShort(p.createdAt)}
                      </div>
                    </div>
                    {/* 迁移层仅图片重写;XSS 白名单在 renderLegacyHtml 收口(research R4) */}
                    <div
                      className={`${FORUM_POST_BODY_CLS} mt-3 lg:text-[15px]`}
                      dangerouslySetInnerHTML={{ __html: p.html }}
                    />
                  </div>
                </div>
              </article>
            );
          })}
        </section>

        {thread.closedAt ? (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
            <p className="px-5 py-4 text-[13px] leading-6 text-muted">
              主题已关闭,不再接受回帖;如需反馈请发新主题或前往客服群。
            </p>
            <ForumPagination
              page={page}
              totalPages={totalPages}
              total={total}
              href={href}
              unit="楼层"
            />
          </div>
        ) : session ? (
          <ReplyForm threadId={thread.id.toString()} lastPageHref={href(totalPages)} />
        ) : (
          <div className="mt-4 overflow-hidden rounded-xl border border-line bg-panel">
            <p className="border-t border-line px-5 py-4 text-[13px] leading-6 text-muted">
              <Link
                href={`/login?next=${encodeURIComponent(`/forum/thread/${thread.id}`)}`}
                className="mr-1 text-link hover:underline"
              >
                登录
              </Link>
              后可回帖;游客仅可浏览。
            </p>
            <ForumPagination
              page={page}
              totalPages={totalPages}
              total={total}
              href={href}
              unit="楼层"
            />
          </div>
        )}
      </ContentPanel>
    </main>
  );
}
