import { AiUsageView } from "@/components/admin/ai-usage/usage-view";
import { getAssistantUsagePage } from "@/server/services/assistant/usage";
import { requireAdmin } from "@/server/session-guard";

/**
 * AI 用量页(2026-11-18 用户反馈):窗口 KPI + 调用日柱 + 每日明细 + 热门问题词。
 * 读 assistant_usage 日聚合表(对话正文不入库),区间切换走 URL searchParams。
 */
export const dynamic = "force-dynamic";

export default async function AdminAiUsagePage({
  searchParams,
}: {
  searchParams: { range?: string };
}) {
  await requireAdmin();
  const range = searchParams.range === "30d" ? "30d" : "7d";
  const view = await getAssistantUsagePage(range === "30d" ? 30 : 7);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">AI 用量</h1>
      <AiUsageView view={view} range={range} />
    </div>
  );
}
