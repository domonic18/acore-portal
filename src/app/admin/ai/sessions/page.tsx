import { SessionsView, type AssistantSessionViewRow } from "@/components/admin/assistant-sessions/sessions-view";
import { AdminPager } from "@/components/ui/pagination";
import { displayUserName, formatDateTime } from "@/lib/format";
import { buildPageHref } from "@/lib/pagination";
import { listAssistantSessionsAdmin } from "@/server/services/assistant/session-log";
import { requireAdmin } from "@/server/session-guard";

/**
 * 后台「AI 管理 → 对话」Tab(2026-11-18 用户反馈,照 aitech-hub 形态):会话台账列表,
 * 行内展开拉取 checkpoint 反序列化的消息时间线(正文不入库,只读)。
 */
export const dynamic = "force-dynamic";

export default async function AdminAssistantSessionsPage({
  searchParams,
}: {
  searchParams: { page?: string };
}) {
  await requireAdmin();
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const { items, total, totalPages } = await listAssistantSessionsAdmin({ page });

  const rows: AssistantSessionViewRow[] = items.map((r) => ({
    threadId: r.threadId,
    title: r.title,
    runs: r.runs,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    tokens: r.promptTokens + r.completionTokens,
    user: displayUserName({ username: r.username, nickname: r.nickname }),
    userRole: r.userRole,
    createdAt: formatDateTime(r.createdAt),
    lastMessageAt: formatDateTime(r.lastMessageAt),
  }));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-[#6482a3]">
        用户与助手「小塔」的会话台账:标题取首问截断,正文仅在行内展开时读取,不入库留存。
      </p>
      <SessionsView items={rows} />
      <AdminPager
        page={page}
        totalPages={totalPages}
        total={total}
        unit="条会话"
        href={(p) => buildPageHref("/admin/ai/sessions", {}, p)}
      />
    </div>
  );
}
