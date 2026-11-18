import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { beijingDateKey } from "@/lib/format";
import { checkSiteTokenQuota } from "@/server/services/assistant/quota";
import {
  getAssistantUsagePage,
  getAssistantUsageSummary,
  recordAssistantUsage,
} from "@/server/services/assistant/usage";

/**
 * 助手用量日聚合集成(M9 W8):写入计数/词频,读侧汇总今日与区间口径;
 * 站点日 Token 限额(2026-11-18)检查读同一张日聚合表。
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

describe("getAssistantUsagePage(独立页读侧)", () => {
  it("窗口内日全字段序列 + 区间合计 + 热门词", async () => {
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
      question: "法师怎么升级",
    });

    const view = await getAssistantUsagePage(7);
    expect(view.days).toBe(7);
    expect(view.daily).toHaveLength(7);
    expect(view.daily.at(-1)?.calls).toBe(2);
    expect(view.daily.at(-1)?.failures).toBe(1);
    expect(view.total.calls).toBe(2);
    expect(view.total.failures).toBe(1);
    expect(view.total.failureRate).toBe(50);
    expect(view.total.tokens).toBe(170);
    expect(view.topKeywords[0]?.keyword).toContain("法师");
    expect(view.topKeywords[0]?.count).toBe(2);
  });

  it("全零窗口回全零序列而非空数组", async () => {
    const view = await getAssistantUsagePage(7);
    expect(view.daily).toHaveLength(7);
    expect(view.daily.every((d) => d.calls === 0)).toBe(true);
    expect(view.total.calls).toBe(0);
    expect(view.total.failureRate).toBe(0);
    expect(view.topKeywords).toEqual([]);
  });
});

describe("checkSiteTokenQuota(站点日 Token 限额)", () => {
  it("当日累计未达上限 → 放行并回已用 Token", async () => {
    await recordAssistantUsage({ ok: true, promptTokens: 900, completionTokens: 100, question: null });
    const verdict = await checkSiteTokenQuota(2000);
    expect(verdict.allowed).toBe(true);
    expect(verdict.usedTokens).toBe(1000);
    expect(verdict.retryAfterSec).toBeUndefined();
  });

  it("当日累计达上限 → 拦截并回下一个北京日零点的 retryAfterSec", async () => {
    await recordAssistantUsage({ ok: true, promptTokens: 1500, completionTokens: 500, question: null });
    const verdict = await checkSiteTokenQuota(2000);
    expect(verdict.allowed).toBe(false);
    expect(verdict.usedTokens).toBe(2000);
    expect(verdict.retryAfterSec).toBeGreaterThan(0);
    expect(verdict.retryAfterSec).toBeLessThanOrEqual(24 * 3600);
  });

  it("上限 0 = 不限额(累计再高也放行)", async () => {
    await recordAssistantUsage({ ok: true, promptTokens: 5000, completionTokens: 5000, question: null });
    const verdict = await checkSiteTokenQuota(0);
    expect(verdict.allowed).toBe(true);
    expect(verdict.usedTokens).toBe(10000);
  });
});
