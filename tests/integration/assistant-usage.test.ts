import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { beijingDateKey } from "@/lib/format";
import {
  getAssistantUsageSummary,
  recordAssistantUsage,
} from "@/server/services/assistant/usage";

/**
 * 助手用量日聚合集成(M9 W8):写入计数/词频,读侧汇总今日与区间口径。
 * 日聚合表按自然日累积,测试前后清当日行,避免污染其他用例。
 */

const DAY = beijingDateKey();

beforeEach(async () => {
  await prisma.assistantUsageKeyword.deleteMany({ where: { day: DAY } });
  await prisma.assistantUsage.deleteMany({ where: { day: DAY } });
});

afterAll(async () => {
  await prisma.assistantUsageKeyword.deleteMany({ where: { day: DAY } });
  await prisma.assistantUsage.deleteMany({ where: { day: DAY } });
  await prisma.$disconnect();
});

describe("recordAssistantUsage / getAssistantUsageSummary", () => {
  it("累加调用量、失败数与 token,失败率按今日口径算", async () => {
    await recordAssistantUsage({
      ok: true,
      promptTokens: 100,
      completionTokens: 20,
      question: "法师怎么升级",
    });
    await recordAssistantUsage({
      ok: false,
      promptTokens: 50,
      completionTokens: 0,
      question: "副本掉落哪些装备",
    });

    const row = await prisma.assistantUsage.findUnique({ where: { day: DAY } });
    expect(row?.calls).toBe(2);
    expect(row?.failures).toBe(1);
    expect(row?.promptTokens).toBe(150);
    expect(row?.completionTokens).toBe(20);

    const summary = await getAssistantUsageSummary(7);
    expect(summary.today.calls).toBe(2);
    expect(summary.today.failures).toBe(1);
    expect(summary.today.failureRate).toBe(50);
    expect(summary.today.tokens).toBe(170);
    expect(summary.days.length).toBe(7);
  });

  it("问题词按日计数累加(脱敏词,不含正文)", async () => {
    await recordAssistantUsage({
      ok: true,
      promptTokens: 1,
      completionTokens: 1,
      question: "法师怎么升级",
    });
    await recordAssistantUsage({
      ok: true,
      promptTokens: 1,
      completionTokens: 1,
      question: "法师怎么升级",
    });

    const rows = await prisma.assistantUsageKeyword.findMany({ where: { day: DAY } });
    const mage = rows.find((r) => r.keyword.includes("法师"));
    expect(mage?.count).toBe(2);

    const summary = await getAssistantUsageSummary(7);
    expect(summary.topKeywords.length).toBeGreaterThan(0);
    expect(summary.topKeywords[0]?.count).toBeGreaterThanOrEqual(2);
  });

  it("无数据时摘要为空值而非报错", async () => {
    const summary = await getAssistantUsageSummary(7);
    expect(summary.today.calls).toBe(0);
    expect(summary.topKeywords).toEqual([]);
  });
});
