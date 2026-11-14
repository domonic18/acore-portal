import Link from "next/link";
import { MessagesSquare, LayoutList } from "lucide-react";
import { adminListThreads, listAdminBoards } from "@/server/services/forum/admin";
import { ForumThreadActions } from "@/components/admin/forum-thread-actions";
import {
  ForumThreadBulkToolbar,
  ForumThreadRowCheckbox,
  ForumThreadSelectAllCheckbox,
  ForumThreadSelectionProvider,
} from "@/components/admin/forum-thread-selection";
import { ForumBoardManager } from "@/components/admin/forum-board-manager";
import { ForumFilterChips } from "@/components/admin/forum-filter-chips";
import { PinnedBadge, FeaturedBadge, ThreadStatusBadge } from "@/components/forum/thread-badge";
import { AdminPager } from "@/components/ui/pagination";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { buildPageHref } from "@/lib/pagination";
import {
  THREAD_LABEL_OPTIONS,
  THREAD_STATUS_TEXT,
} from "@/constants/forum";
import { formatDateTime } from "@/lib/format";

type SearchParams = {
  tab?: string;
  board?: string;
  q?: string;
  pinned?: string;
  featured?: string;
  label?: string;
  deleted?: string;
  page?: string;
};

const TABS = [
  { key: "boards", label: "版块管理", icon: LayoutList },
  { key: "threads", label: "主题管理", icon: MessagesSquare },
] as const;

/**
 * 后台论坛管理(2026-11-03 tab 化,行业惯例:先版块管理后主题管理):
 * tab 走 URL(?tab=threads 可直达/分享);主题侧保留跨版块筛选+版务操作+回收站。
 */
export default async function AdminForumPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const tab = searchParams.tab === "threads" ? "threads" : "boards";
  const boards = await listAdminBoards();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">论坛管理</h1>

      <div className="flex items-center gap-1.5" role="tablist" aria-label="论坛管理分区">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <Link
              key={key}
              prefetch={false}
              href={`/admin/forum${key === "threads" ? "?tab=threads" : ""}`}
              role="tab"
              aria-selected={active}
              className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60 ${
                active
                  ? "border-[#6fb7e0] bg-[#6fb7e0]/15 font-semibold text-[#a8d9f5]"
                  : "border-[#22385a] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]"
              }`}
            >
              <Icon aria-hidden="true" className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>

      {tab === "boards" ? (
        <ForumBoardManager boards={boards} />
      ) : (
        <ThreadsSection boards={boards} searchParams={searchParams} />
      )}
    </div>
  );
}

async function ThreadsSection({
  boards,
  searchParams,
}: {
  boards: Awaited<ReturnType<typeof listAdminBoards>>;
  searchParams: SearchParams;
}) {
  const q = searchParams.q?.trim() ?? "";
  const deleted = searchParams.deleted === "1";
  const pinned = searchParams.pinned === "1" ? true : undefined;
  const featured = searchParams.featured === "1" ? true : undefined;
  const label = searchParams.label ?? "";
  const boardSlug = searchParams.board ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const boardId = boardSlug
    ? BigInt(boards.find((b) => b.slug === boardSlug)?.id ?? 0) || undefined
    : undefined;
  const { items, totalPages, total } = await adminListThreads({
    boardId,
    q,
    pinned,
    featured,
    label: label || undefined,
    deleted,
    page,
  });

  const pageHref = (p: number) =>
    buildPageHref(
      "/admin/forum",
      {
        tab: "threads",
        board: boardSlug || undefined,
        q: q || undefined,
        pinned: pinned ? "1" : undefined,
        featured: featured ? "1" : undefined,
        label: label || undefined,
        deleted: deleted ? "1" : undefined,
      },
      p,
    );

  return (
    <div className="flex flex-col gap-4">
      <form method="GET" action="/admin/forum" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="threads" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">版块</span>
          <Select name="board" defaultValue={boardSlug} className="w-auto">
            <option value="">全部版块</option>
            {boards.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">标题关键词</span>
          <Input name="q" defaultValue={q} placeholder="回车搜索" className="w-56" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[#93b2ce]">状态标签</span>
          <Select name="label" defaultValue={label} className="w-auto">
            <option value="">全部</option>
            {THREAD_LABEL_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {THREAD_STATUS_TEXT[v]}
              </option>
            ))}
          </Select>
        </label>
        <ForumFilterChips
          pinned={pinned === true}
          featured={featured === true}
          deleted={deleted}
        />
        <Button type="submit" variant="primary">
          筛选
        </Button>
        <Link
          prefetch={false}
          href="/admin/forum?tab=threads"
          className={`rounded text-sm text-[#6482a3] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
        >
          清除
        </Link>
      </form>

      <ForumThreadSelectionProvider ids={items.map((t) => t.id)}>
        {items.length > 0 && <ForumThreadBulkToolbar />}
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
            没有匹配的主题。
          </p>
        ) : (
          <Table minWidth="min-w-[900px]">
            <THead>
              <tr>
                <Th>
                  <ForumThreadSelectAllCheckbox />
                </Th>
                <Th>标题</Th>
                <Th>版块</Th>
                <Th>作者</Th>
                <Th>状态</Th>
                <Th>回复</Th>
                <Th>最后活动</Th>
                <Th>操作</Th>
              </tr>
            </THead>
            <tbody>
              {items.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    <ForumThreadRowCheckbox id={t.id} />
                  </Td>
                  <Td className="max-w-md">
                    <Link
                      href={`/forum/thread/${t.id}`}
                      className={`rounded text-[#6fb7e0] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
                      target="_blank"
                    >
                      {t.pinned && <PinnedBadge />} {t.featured && <FeaturedBadge />} {t.title}
                    </Link>
                  </Td>
                  <Td className="whitespace-nowrap text-[#93b2ce]">{t.boardName}</Td>
                  <Td className="whitespace-nowrap text-[#93b2ce]">{t.authorName}</Td>
                  <Td>
                    <ThreadStatusBadge
                      statusLabel={t.statusLabel}
                      closedAt={t.closedAt ? new Date(t.closedAt) : null}
                    />
                  </Td>
                  <Td className="whitespace-nowrap text-[#93b2ce]">{t.replyCount}</Td>
                  <Td className="whitespace-nowrap text-xs text-[#6482a3]">
                    {formatDateTime(t.lastPostAt)}
                  </Td>
                  <Td>
                    <ForumThreadActions
                      threadId={t.id}
                      pinned={t.pinned}
                      featured={t.featured}
                      closed={t.closedAt !== null}
                      label={t.statusLabel}
                      deleted={deleted}
                    />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </ForumThreadSelectionProvider>

      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="条主题"
        href={pageHref}
      />
    </div>
  );
}
