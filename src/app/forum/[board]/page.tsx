import Link from "next/link";
import { notFound } from "next/navigation";
import { Flame, ImageIcon, Pin, ShieldCheck, Plus } from "lucide-react";
import { ContentPanel } from "@/components/site/content-panel";
import { ForumPagination } from "@/components/forum/forum-pagination";
import { FeaturedBadge, PinnedBadge, ThreadStatusBadge } from "@/components/forum/thread-badge";
import { FORUM_PAGE_SIZE } from "@/constants/pagination";
import {
  FORUM_BOARD_TABS,
  FORUM_HOT_REPLY_THRESHOLD,
  FORUM_NEW_REPLY_WINDOW_HOURS,
  type ForumBoardTabKey,
} from "@/constants/forum";
import { formatShortDate } from "@/lib/format";
import { paginate } from "@/lib/pagination";
import {
  getForumBoardBySlug,
  getForumBoardStats,
  listBoardThreads,
  listForumModerators,
} from "@/server/services/forum/browse";
import { getServerSession } from "@/server/session-guard";
import { ButtonLink } from "@/components/ui/button";
import { renderMarkdown } from "@/lib/markdown";
import { getCdnHosts } from "@/lib/config";
import { MARKDOWN_BODY_CLS } from "@/constants/content";
import { cn } from "@/lib/cn";

export const metadata = { title: "版块 · 老克塔论坛" };

type ThreadRow = Awaited<ReturnType<typeof listBoardThreads>>["items"][number];

const RIGHT_COL_HINT = "回复 / 查看 / 最后回复";

/** 回复数气泡:有回复=蓝色气泡(图形化突出),0 回复=灰字弱化 */
function ReplyBubble({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-[13.5px] text-muted">0</span>;
  }
  return (
    <span className="inline-block min-w-[34px] rounded-lg bg-link/12 px-2.5 py-0.5 text-center text-[14px] font-bold text-num">
      {count}
    </span>
  );
}

function TitleIcons({ thread }: { thread: ThreadRow }) {
  return (
    <>
      {thread.hasImage && (
        <span
          className="inline-flex shrink-0 items-center text-muted"
          title="主贴含图片"
          aria-label="主贴含图片"
        >
          <ImageIcon aria-hidden="true" className="h-[14px] w-[14px]" />
        </span>
      )}
      {thread.replyCount >= FORUM_HOT_REPLY_THRESHOLD && (
        <span
          className="inline-flex shrink-0 items-center text-warn"
          title={`热帖:回复≥${FORUM_HOT_REPLY_THRESHOLD}`}
          aria-label="热帖"
        >
          <Flame aria-hidden="true" className="h-[14px] w-[14px]" />
        </span>
      )}
    </>
  );
}

/** 「新」角标:最近回复距现在不足 24h(0 回复的主题不算——主贴不算回复) */
function isNewReply(thread: ThreadRow): boolean {
  if (thread.replyCount === 0) return false;
  return Date.now() - thread.lastPostAt.getTime() < FORUM_NEW_REPLY_WINDOW_HOURS * 3600_000;
}

function ThreadRowBody({ thread }: { thread: ThreadRow }) {
  const mobileMeta = `${thread.replyCount} 回复 · ${thread.viewCount} 查看 · ${formatShortDate(thread.lastPostAt)}`;
  return (
    <>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          {thread.pinned && <PinnedBadge />}
          {thread.featured && <FeaturedBadge />}
          <ThreadStatusBadge statusLabel={thread.statusLabel} closedAt={thread.closedAt} />
          <span className="min-w-0 flex-1 text-[15px] font-medium leading-[1.45] text-heading group-hover:text-link">
            {thread.title}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            <TitleIcons thread={thread} />
          </span>
        </span>
        <span className="mt-0.5 block text-[12px] text-muted">
          {thread.authorName} · {formatShortDate(thread.createdAt)}
        </span>
        <span className="mt-0.5 block text-[12px] text-muted lg:hidden">{mobileMeta}</span>
      </span>
      <span className="hidden w-[64px] shrink-0 pt-0.5 text-right lg:block">
        <ReplyBubble count={thread.replyCount} />
      </span>
      <span className="hidden w-[64px] shrink-0 text-right text-[13.5px] text-muted lg:block">
        {thread.viewCount}
      </span>
      <span className="hidden w-[168px] shrink-0 truncate text-right text-[13px] text-muted lg:block">
        <span className="text-body">{thread.lastReplierName}</span> ·{" "}
        {formatShortDate(thread.lastPostAt)}
        {isNewReply(thread) && (
          <span className="ml-1.5 inline-block whitespace-nowrap rounded-full border border-danger/40 bg-danger/14 px-1.5 py-[2px] align-[1px] text-[10px] font-semibold leading-none text-danger">
            新
          </span>
        )}
      </span>
    </>
  );
}

function ThreadList({ threads, tinted = false }: { threads: ThreadRow[]; tinted?: boolean }) {
  return (
    <ul>
      {threads.map((t) => (
        <li
          key={t.id.toString()}
          className={cn(
            "border-t border-line",
            tinted && "bg-highlight/[0.045] hover:bg-highlight/[0.09]",
          )}
        >
          <Link href={`/forum/thread/${t.id}`} className="group flex items-start gap-3.5 px-5 py-3">
            <ThreadRowBody thread={t} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SectionHead({
  tone,
  title,
  icon,
}: {
  tone: "gold" | "blue";
  title: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 px-5 py-3.5">
      <span
        className={cn("h-4 w-[5px] rounded-sm", tone === "gold" ? "bg-highlight" : "bg-link")}
        aria-hidden="true"
      />
      <h2
        className={cn(
          "text-[16px] font-semibold",
          tone === "gold" ? "text-highlight" : "text-num",
        )}
      >
        {title}
      </h2>
      {icon}
      <span className="ml-auto hidden text-[12px] text-muted sm:inline">{RIGHT_COL_HINT}</span>
    </div>
  );
}

/** 主题列表(FR-219):筛选 tab(最新/热门/热帖/精华)+ 置顶独立分区(Discuz 口径),20/页 */
export default async function ForumBoardPage({
  params,
  searchParams,
}: {
  params: { board: string };
  searchParams: { page?: string; filter?: string };
}) {
  const session = await getServerSession();
  const board = await getForumBoardBySlug(params.board);
  if (!board) notFound();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const tab: ForumBoardTabKey = (FORUM_BOARD_TABS.find(
    (t) => t.key === searchParams.filter,
  )?.key ?? "latest") as ForumBoardTabKey;
  const [{ items, total, pageSize }, stats, moderators] = await Promise.all([
    listBoardThreads({ boardId: board.id, page, pageSize: FORUM_PAGE_SIZE, tab }),
    getForumBoardStats(board.id),
    listForumModerators(),
  ]);
  const { totalPages } = paginate(total, page, pageSize);
  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (tab !== "latest") qs.set("filter", tab);
    if (p > 1) qs.set("page", String(p));
    const query = qs.toString();
    return query ? `/forum/${board.slug}?${query}` : `/forum/${board.slug}`;
  };
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
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-start">
            <span className="h-[38px] w-1 shrink-0 rounded-sm bg-link" aria-hidden="true" />
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
              <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12.5px] text-muted">
                <span>
                  主题 <b className="font-semibold text-num">{total}</b>
                </span>
                <span>
                  回复 <b className="font-semibold text-num">{stats.replyCount}</b>
                </span>
                {moderators.length > 0 && (
                  <span className="inline-flex items-center gap-1.5">
                    <ShieldCheck aria-hidden="true" className="h-[14px] w-[14px]" />
                    <span className="whitespace-nowrap">版主:</span>
                    {moderators.map((name, i) => (
                      <span key={name} className="whitespace-nowrap">
                        {i > 0 && <span className="text-muted"> · </span>}
                        <span className="text-link">{name}</span>
                      </span>
                    ))}
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
              {session ? (
                <ButtonLink href={`/forum/${board.slug}/new`} variant="primary">
                  <Plus aria-hidden="true" className="h-4 w-4" />
                  发新帖
                </ButtonLink>
              ) : (
                <Link
                  href={`/login?next=${encodeURIComponent(`/forum/${board.slug}/new`)}`}
                  className="rounded-lg border border-line bg-panel-strong px-4 py-2 text-[13px] text-link hover:text-link-hover"
                >
                  登录后可发帖
                </Link>
              )}
              <span className="text-[11px] text-muted">发帖前请先搜索是否已有同类反馈</span>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-xl border border-line bg-panel">
          <div className="flex flex-wrap items-center gap-2 px-5 pt-3.5">
            <span className="mr-0.5 text-[12.5px] text-muted">筛选</span>
            {FORUM_BOARD_TABS.map((t) => (
              <Link
                key={t.key}
                href={
                  t.key === "latest"
                    ? `/forum/${board.slug}`
                    : `/forum/${board.slug}?filter=${t.key}`
                }
                aria-current={t.key === tab ? "page" : undefined}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[12.5px] transition",
                  t.key === tab
                    ? "border-highlight bg-highlight/14 font-semibold text-highlight-soft"
                    : "border-line text-muted hover:border-border-strong hover:text-body",
                )}
              >
                {t.label}
                {t.key === "featured" && stats.featuredCount > 0 && (
                  <span className="text-[11px] opacity-80">{stats.featuredCount}</span>
                )}
              </Link>
            ))}
          </div>

          {pinned.length > 0 && (
            <div className="mt-3">
              <SectionHead
                tone="gold"
                title="置顶公告"
                icon={
                  <Pin
                    aria-hidden="true"
                    className="h-[14px] w-[14px] text-highlight"
                  />
                }
              />
              <ThreadList threads={pinned} tinted />
            </div>
          )}

          <div className={cn(pinned.length > 0 && "mt-3 border-t border-line")}>
            <SectionHead tone="blue" title="全部主题" />
            {rest.length === 0 ? (
              <p className="border-t border-line py-12 text-center text-[13px] text-muted">
                暂无主题。
              </p>
            ) : (
              <ThreadList threads={rest} />
            )}
            <ForumPagination page={page} totalPages={totalPages} total={total} href={href} />
          </div>
        </section>
      </ContentPanel>
    </main>
  );
}
