import { Bot, Cpu, MessageSquareText, TrendingDown } from "lucide-react";
import Link from "next/link";

import { Metric } from "@/components/admin/dashboard/assistant-panel";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";
import { FOCUS_RING } from "@/components/ui/admin-tokens";

/**
 * AI 用量页视图(独立页 /admin/ai-usage,2026-11-18 用户反馈):
 * 窗口 KPI(调用/失败率/token/日均)+ 调用日柱(失败红段)+ 每日明细表 + 热门问题词。
 * 纯展示,数据由页面层 services/assistant/usage 传入(components 禁 import server)。
 */

type UsageView = {
  days: number;
  daily: {
    day: string;
    calls: number;
    failures: number;
    promptTokens: number;
    completionTokens: number;
  }[];
  total: {
    calls: number;
    failures: number;
    failureRate: number;
    promptTokens: number;
    completionTokens: number;
    tokens: number;
  };
  topKeywords: { keyword: string; count: number }[];
};

const RANGES = [
  { value: "7d", label: "近 7 天", days: 7 },
  { value: "30d", label: "近 30 天", days: 30 },
] as const;

export function AiUsageView({ view, range }: { view: UsageView; range: string }) {
  const maxCalls = Math.max(1, ...view.daily.map((d) => d.calls));
  const avgCalls =
    view.days > 0 ? Math.round((view.total.calls / view.days) * 10) / 10 : 0;

  return (
    <div className="flex flex-col gap-4" data-testid="admin-ai-usage">
      <nav className="flex items-center gap-2 text-sm" aria-label="统计窗口">
        {RANGES.map((r) =>
          r.value === range ? (
            <span
              key={r.value}
              className="rounded-md border border-[#6fb7e0]/50 bg-[#6fb7e0]/10 px-3 py-1 font-semibold text-[#a8d9f5]"
            >
              {r.label}
            </span>
          ) : (
            <Link
              key={r.value}
              prefetch={false}
              href={`/admin/ai-usage?range=${r.value}`}
              className={`rounded-md border border-transparent px-3 py-1 text-[#93b2ce] transition hover:bg-[#13233a] hover:text-[#dcebf7] ${FOCUS_RING}`}
            >
              {r.label}
            </Link>
          ),
        )}
      </nav>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric icon={<Bot />} value={view.total.calls} label={`近 ${view.days} 日调用`} />
        <Metric
          icon={<TrendingDown />}
          value={`${view.total.failureRate}%`}
          label="失败率"
          tone={view.total.failureRate > 0 ? "warn" : "default"}
        />
        <Metric icon={<Cpu />} value={view.total.tokens} label={`近 ${view.days} 日 token`} />
        <Metric
          icon={<MessageSquareText />}
          value={avgCalls}
          label="日均调用"
        />
      </div>

      <section className="rounded-xl border border-[#22385a] bg-[#13233a] p-4">
        <p className="mb-2 text-[12px] text-[#6482a3]">
          调用分布(蓝色 = 调用,红色 = 失败)
        </p>
        <div className="flex items-end gap-1">
          {view.daily.map((d) => (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span className="text-[10px] text-[#93b2ce]">{d.calls || ""}</span>
              <div
                className="flex w-full flex-col justify-end overflow-hidden rounded-sm"
                style={{ height: `${Math.max(3, (d.calls / maxCalls) * 56)}px` }}
                title={`${d.day}:调用 ${d.calls} / 失败 ${d.failures}`}
              >
                <span
                  className="w-full bg-[#c25b5b]"
                  style={{ height: `${d.calls > 0 ? (d.failures / d.calls) * 100 : 0}%` }}
                />
                <span className="w-full flex-1 bg-[#2f6f9e]" />
              </div>
              <span className="w-full truncate text-center text-[9.5px] text-[#6482a3]">
                {d.day.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <Table minWidth="min-w-[680px]">
        <THead>
          <Tr>
            <Th>日期</Th>
            <Th>调用</Th>
            <Th>失败</Th>
            <Th>Prompt Tokens</Th>
            <Th>Completion Tokens</Th>
            <Th>合计 Tokens</Th>
          </Tr>
        </THead>
        <tbody>
          {view.daily
            .filter((d) => d.calls > 0)
            .map((d) => (
              <Tr key={d.day}>
                <Td className="whitespace-nowrap">{d.day}</Td>
                <Td className="whitespace-nowrap">{d.calls}</Td>
                <Td className={`whitespace-nowrap ${d.failures > 0 ? "text-[#eda9a9]" : ""}`}>
                  {d.failures}
                </Td>
                <Td className="whitespace-nowrap">{d.promptTokens}</Td>
                <Td className="whitespace-nowrap">{d.completionTokens}</Td>
                <Td className="whitespace-nowrap font-medium">
                  {d.promptTokens + d.completionTokens}
                </Td>
              </Tr>
            ))}
          {view.daily.every((d) => d.calls === 0) && (
            <Tr>
              <Td colSpan={6} className="text-center text-[#6482a3]">
                窗口内暂无调用记录
              </Td>
            </Tr>
          )}
        </tbody>
      </Table>

      <section className="rounded-xl border border-[#22385a] bg-[#13233a] p-4">
        <p className="mb-2 text-[12px] text-[#6482a3]">热门问题词(脱敏聚合,区间 Top10)</p>
        {view.topKeywords.length === 0 ? (
          <p className="text-[12px] text-[#6482a3]">暂无数据</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {view.topKeywords.map((k) => (
              <span
                key={k.keyword}
                className="rounded-full border border-[#22385a] bg-[#0b1526] px-2.5 py-1 text-[11.5px] text-[#c4d9ec]"
              >
                <span>{k.keyword}</span>
                <span className="ml-1.5 text-[#6482a3]">{k.count}</span>
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
