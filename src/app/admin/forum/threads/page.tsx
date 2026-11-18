import Link from "next/link";
import { adminListThreads, listAdminBoards } from "@/server/services/forum/admin";
import { ForumThreadActions } from "@/components/admin/forum-thread-actions";
import {
  ForumThreadBulkToolbar,
  ForumThreadRowCheckbox,
  ForumThreadSelectAllCheckbox,
  ForumThreadSelectionProvider,
} from "@/components/admin/forum-thread-selection";
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
  board?: string;
  q?: string;
  pinned?: string;
  featured?: string;
  label?: string;
  deleted?: string;
  page?: string;
};

/**
 * 后台主题管理(2026-11-18 自 /admin/forum?tab=threads 拆为路径子路由;
 * 主题侧保留跨版块筛选+版务操作+回收站,URL 直达/分享不变)。
 */
export default async function AdminForumThreadsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const boards = await listAdminBoards();

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
      "/admin/forum/threads",
      {
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
      {/* Provider 包住筛选行与表格:批量工具条随勾选状态在筛选行内出现(对齐商品列表操作行) */}
      <ForumThreadSelectionProvider ids={items.map((t) => t.id)}>
        <div className="flex flex-wrap items-end gap-3">
          <form
            method="GET"
            action="/admin/forum/threads"
            className="flex flex-wrap items-end gap-3"
          >
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
              href="/admin/forum/threads"
              className={`rounded text-sm text-[#6482a3] underline-offset-2 hover:text-[#a8d9f5] hover:underline ${FOCUS_RING}`}
            >
              清除
            </Link>
          </form>
          {items.length > 0 && <ForumThreadBulkToolbar />}
        </div>
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
