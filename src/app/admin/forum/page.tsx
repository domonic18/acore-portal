import Link from "next/link";
import { adminListThreads, listAdminBoards } from "@/server/services/forum/admin";
import { ForumThreadActions } from "@/components/admin/forum-thread-actions";
import { ForumBoardManager } from "@/components/admin/forum-board-manager";
import { PinnedBadge, ThreadStatusBadge } from "@/app/_components/forum/thread-badge";

type SearchParams = {
  board?: string;
  q?: string;
  pinned?: string;
  closed?: string;
  label?: string;
  deleted?: string;
  page?: string;
};

/** 后台论坛管理:跨版块主题筛选+版务操作(含回收站/恢复)+版块管理区块 */
export default async function AdminForumPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const q = searchParams.q?.trim() ?? "";
  const deleted = searchParams.deleted === "1";
  const pinned = searchParams.pinned === "1" ? true : undefined;
  const closed = searchParams.closed === "1" ? true : undefined;
  const label = searchParams.label ?? "";
  const boardSlug = searchParams.board ?? "";
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);

  const boards = await listAdminBoards();
  const boardId = boardSlug ? BigInt(boards.find((b) => b.slug === boardSlug)?.id ?? 0) || undefined : undefined;
  const { items, totalPages, total } = await adminListThreads({
    boardId,
    q,
    pinned,
    closed,
    label: label || undefined,
    deleted,
    page,
  });

  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (boardSlug) params.set("board", boardSlug);
    if (q) params.set("q", q);
    if (pinned) params.set("pinned", "1");
    if (closed) params.set("closed", "1");
    if (label) params.set("label", label);
    if (deleted) params.set("deleted", "1");
    params.set("page", String(p));
    return `/admin/forum?${params.toString()}`;
  };

  const selectCls = "rounded border border-gray-700 bg-gray-900 px-3 py-2 text-white";

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">论坛管理</h1>

      <form method="GET" action="/admin/forum" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">版块</span>
          <select name="board" defaultValue={boardSlug} className={selectCls}>
            <option value="">全部版块</option>
            {boards.map((b) => (
              <option key={b.id} value={b.slug}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">标题关键词</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="回车搜索"
            className={`${selectCls} w-56`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-gray-300">状态标签</span>
          <select name="label" defaultValue={label} className={selectCls}>
            <option value="">全部</option>
            <option value="none">无标签</option>
            <option value="standard">规范</option>
            <option value="resolved">已解决</option>
            <option value="closed">已关闭</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-300">
          <input type="checkbox" name="pinned" value="1" defaultChecked={pinned} />
          仅置顶
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-300">
          <input type="checkbox" name="closed" value="1" defaultChecked={closed} />
          仅已关闭
        </label>
        <label className="flex items-center gap-1 text-sm text-gray-300">
          <input type="checkbox" name="deleted" value="1" defaultChecked={deleted} />
          回收站(已删)
        </label>
        <button
          type="submit"
          className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          筛选
        </button>
        <Link href="/admin/forum" className="text-sm text-gray-400 hover:underline">
          清除
        </Link>
      </form>

      {items.length === 0 ? (
        <p className="rounded border border-dashed border-gray-700 px-6 py-10 text-center text-gray-400">
          没有匹配的主题。
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-3 font-normal">标题</th>
              <th className="py-2 pr-3 font-normal">版块</th>
              <th className="py-2 pr-3 font-normal">作者</th>
              <th className="py-2 pr-3 font-normal">状态</th>
              <th className="py-2 pr-3 font-normal">回复</th>
              <th className="py-2 pr-3 font-normal">最后活动</th>
              <th className="py-2 pr-3 font-normal">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((t) => (
              <tr key={t.id} className="border-b border-gray-900">
                <td className="max-w-md py-2 pr-3">
                  <Link
                    href={`/forum/thread/${t.id}`}
                    className="text-blue-400 hover:underline"
                    target="_blank"
                  >
                    {t.pinned && <PinnedBadge />} {t.title}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-gray-400">{t.boardName}</td>
                <td className="py-2 pr-3 text-gray-400">{t.authorName}</td>
                <td className="py-2 pr-3">
                  <ThreadStatusBadge
                    statusLabel={t.statusLabel as "none" | "standard" | "resolved" | "closed"}
                    closedAt={t.closedAt ? new Date(t.closedAt) : null}
                  />
                </td>
                <td className="py-2 pr-3 text-gray-400">{t.replyCount}</td>
                <td className="py-2 pr-3 text-xs text-gray-500">
                  {new Date(t.lastPostAt).toLocaleString("zh-CN")}
                </td>
                <td className="py-2 pr-3">
                  <ForumThreadActions
                    threadId={t.id}
                    pinned={t.pinned}
                    closed={t.closedAt !== null}
                    label={t.statusLabel === "closed" ? "none" : t.statusLabel}
                    deleted={deleted}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>共 {total} 条主题</span>
        {totalPages > 1 && (
          <nav className="flex items-center gap-4">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="text-blue-400 hover:underline">
                上一页
              </Link>
            ) : (
              <span className="text-gray-600">上一页</span>
            )}
            <span>
              第 {page} / {totalPages} 页
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="text-blue-400 hover:underline">
                下一页
              </Link>
            ) : (
              <span className="text-gray-600">下一页</span>
            )}
          </nav>
        )}
      </div>

      <hr className="border-gray-800" />
      <ForumBoardManager boards={boards} />
    </div>
  );
}
