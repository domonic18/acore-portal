import { Bot, Cpu, TrendingDown, Zap } from "lucide-react";

import { Card, CardBody, CardHeader } from "@/components/ui/card";

/**
 * 仪表盘「AI 助手」面板(M9 W8):今日调用/失败率/token + 近 7 日调用柱 + 热门问题词。
 * 数据由服务端 services/stats/dashboard 聚合传入(components 禁 import server)。
 */

type UsageSummary = {
  today: {
    calls: number;
    failures: number;
    failureRate: number;
    tokens: number;
  };
  days: { day: string; calls: number; failures: number }[];
  topKeywords: { keyword: string; count: number }[];
};

function Metric({
  icon,
  value,
  label,
  tone = "default",
}: {
  icon: React.ReactNode;
  value: React.ReactNode;
  label: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="min-w-0 rounded-lg border border-[#22385a] bg-[#13233a] px-3 py-2.5">
      <span className="flex items-center gap-1.5 text-[11px] text-[#6482a3]">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        {label}
      </span>
      <span
        className={`mt-1 block text-lg font-bold leading-6 ${
          tone === "warn" ? "text-[#eda9a9]" : "text-[#dcebf7]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export function DashboardAssistantPanel({ usage }: { usage: UsageSummary }) {
  const maxCalls = Math.max(1, ...usage.days.map((d) => d.calls));

  return (
    <Card data-testid="admin-assistant-panel">
      <CardHeader title="AI 助手" />
      <CardBody className="space-y-3.5">
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Metric icon={<Bot />} value={usage.today.calls} label="今日调用" />
          <Metric
            icon={<TrendingDown />}
            value={`${usage.today.failureRate}%`}
            label="今日失败率"
            tone={usage.today.failureRate > 0 ? "warn" : "default"}
          />
          <Metric icon={<Cpu />} value={usage.today.tokens} label="今日 token" />
          <Metric
            icon={<Zap />}
            value={usage.days.reduce((sum, d) => sum + d.calls, 0)}
            label="近 7 日调用"
          />
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] text-[#6482a3]">近 7 日调用分布</p>
          <div className="flex items-end gap-1.5">
            {usage.days.map((d) => (
              <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <span className="text-[10.5px] text-[#93b2ce]">{d.calls}</span>
                <span
                  className="w-full rounded-sm bg-[#2f6f9e]"
                  style={{ height: `${Math.max(3, (d.calls / maxCalls) * 44)}px` }}
                />
                <span className="w-full truncate text-center text-[10px] text-[#6482a3]">
                  {d.day.slice(5)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[11.5px] text-[#6482a3]">热门问题词(脱敏聚合)</p>
          {usage.topKeywords.length === 0 ? (
            <p className="text-[12px] text-[#6482a3]">暂无数据</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {usage.topKeywords.map((k) => (
                <span
                  key={k.keyword}
                  className="rounded-full border border-[#22385a] bg-[#13233a] px-2.5 py-1 text-[11.5px] text-[#c4d9ec]"
                >
                  <span>{k.keyword}</span>
                  <span className="ml-1.5 text-[#6482a3]">{k.count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
