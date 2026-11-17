import "server-only";

import { prisma } from "@/lib/db";
import { beijingDateKey } from "@/lib/format";
import { extractQuestionKeywords } from "./keywords";

/**
 * AI 助手用量日聚合(M9 W8):看板「AI 助手」面板的读侧。
 * 写入侧在 SSE 路由收尾处(与审计同批),只落聚合指标与脱敏问题词,
 * 不落对话正文(与审计同口径)。
 */

export interface AssistantUsageRecord {
  ok: boolean;
  promptTokens: number;
  completionTokens: number;
  /** 原始提问:只用于抽脱敏词,不落库 */
  question?: string | null;
}

export interface AssistantUsageSummary {
  today: {
    calls: number;
    failures: number;
    /** 失败率(百分比,整数) */
    failureRate: number;
    promptTokens: number;
    completionTokens: number;
    tokens: number;
  };
  /** 近 N 日调用量序列(按日升序,缺日补零) */
  days: { day: string; calls: number; failures: number }[];
  topKeywords: { keyword: string; count: number }[];
}

const TOP_KEYWORDS = 10;

/** 读侧失败时的降级空值(看板区块不拖垮整响应) */
export const EMPTY_ASSISTANT_USAGE: AssistantUsageSummary = {
  today: {
    calls: 0,
    failures: 0,
    failureRate: 0,
    promptTokens: 0,
    completionTokens: 0,
    tokens: 0,
  },
  days: [],
  topKeywords: [],
};

/** 记一次问答用量(计数与词频走 upsert 原子自增) */
export async function recordAssistantUsage(record: AssistantUsageRecord): Promise<void> {
  const day = beijingDateKey();
  const failures = record.ok ? 0 : 1;
  await prisma.assistantUsage.upsert({
    where: { day },
    create: {
      day,
      calls: 1,
      failures,
      promptTokens: record.promptTokens,
      completionTokens: record.completionTokens,
    },
    update: {
      calls: { increment: 1 },
      failures: { increment: failures },
      promptTokens: { increment: record.promptTokens },
      completionTokens: { increment: record.completionTokens },
    },
  });

  const keywords = extractQuestionKeywords(record.question);
  for (const keyword of keywords) {
    await prisma.assistantUsageKeyword.upsert({
      where: { day_keyword: { day, keyword } },
      create: { day, keyword, count: 1 },
      update: { count: { increment: 1 } },
    });
  }
}

function emptyDay(day: string) {
  return { day, calls: 0, failures: 0 };
}

/** 看板摘要:今日指标 + 近 days 日序列 + 区间热门问题词 */
export async function getAssistantUsageSummary(
  days = 7,
): Promise<AssistantUsageSummary> {
  const today = beijingDateKey();
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 3600 * 1000);
    dayKeys.push(beijingDateKey(d));
  }
  const from = dayKeys[0] ?? today;

  const [rows, keywordRows] = await Promise.all([
    prisma.assistantUsage.findMany({
      where: { day: { gte: from, lte: today } },
      select: { day: true, calls: true, failures: true, promptTokens: true, completionTokens: true },
    }),
    prisma.assistantUsageKeyword.findMany({
      where: { day: { gte: from, lte: today } },
      orderBy: [{ count: "desc" }, { keyword: "asc" }],
      take: TOP_KEYWORDS * 3,
      select: { keyword: true, count: true },
    }),
  ]);

  const byDay = new Map(rows.map((r) => [r.day, r]));
  const todayRow = byDay.get(today);
  const calls = todayRow?.calls ?? 0;
  const failures = todayRow?.failures ?? 0;

  const merged = new Map<string, number>();
  for (const row of keywordRows) {
    merged.set(row.keyword, (merged.get(row.keyword) ?? 0) + row.count);
  }

  return {
    today: {
      calls,
      failures,
      failureRate: calls > 0 ? Math.round((failures / calls) * 100) : 0,
      promptTokens: todayRow?.promptTokens ?? 0,
      completionTokens: todayRow?.completionTokens ?? 0,
      tokens: (todayRow?.promptTokens ?? 0) + (todayRow?.completionTokens ?? 0),
    },
    days: dayKeys.map((day) => {
      const row = byDay.get(day);
      return row
        ? { day, calls: row.calls, failures: row.failures }
        : emptyDay(day);
    }),
    topKeywords: [...merged.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count || a.keyword.localeCompare(b.keyword))
      .slice(0, TOP_KEYWORDS),
  };
}
