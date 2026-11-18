import { describe, expect, it, test } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildAssistantCleanupCard,
  buildAssistantCleanupFailureCard,
} from "../../scripts/cron/assistant-cleanup-alert";

/**
 * 会话清理的飞书同步单测(2026-11-18):
 * ① 卡片只落数量与时间,对话正文不入卡片(脱敏口径);
 * ② 有回收走绿、无超期走蓝(两者都是「跑过了」的正向信号,兼作任务心跳);
 * ③ 失败走红卡且带失败原因;
 * ④ 守卫:清理脚本必须真的把卡片发出去(否则卡片构造器写了也白写)。
 */

const REPO_ROOT = join(__dirname, "..", "..");

function fieldValue(card: { fields?: { label: string; value: string }[] }, label: string) {
  return card.fields?.find((f) => f.label === label)?.value;
}

describe("会话清理卡片", () => {
  it("有回收:绿卡 + 数量/行数/保留期齐备", () => {
    const card = buildAssistantCleanupCard({
      threads: 3,
      rows: 42,
      retentionDays: 30,
      cutoff: "2026-10-19T01:00:00.000Z",
    });
    expect(card.template).toBe("green");
    expect(card.title).toContain("助手会话清理完成");
    expect(fieldValue(card, "回收会话")).toBe("3 个");
    expect(fieldValue(card, "删除行数")).toBe("42 行");
    expect(fieldValue(card, "保留期")).toBe("30 天");
    expect(fieldValue(card, "判定截止")).toMatch(/\d{4}\/\d{2}\/\d{2}/);
  });

  it("无超期:蓝卡(区别于「有回收」),不谎报删除量", () => {
    const card = buildAssistantCleanupCard({
      threads: 0,
      rows: 0,
      retentionDays: 30,
      cutoff: "2026-10-19T01:00:00.000Z",
    });
    expect(card.template).toBe("blue");
    expect(card.title).toContain("无超期会话");
    expect(fieldValue(card, "回收会话")).toBe("0 个");
    expect(fieldValue(card, "删除行数")).toBe("0 行");
  });

  it("失败:红卡 + 失败原因入正文", () => {
    const card = buildAssistantCleanupFailureCard({ reason: "P1001 连不上库" });
    expect(card.template).toBe("red");
    expect(card.title).toBe("助手会话清理失败");
    expect(card.body).toContain("P1001 连不上库");
  });

  it("失败原因缺失时给占位,不出现空正文", () => {
    const card = buildAssistantCleanupFailureCard({ reason: "" });
    expect(card.body).toContain("(未记录)");
  });
});

describe("清理脚本接线守卫", () => {
  const script = readFileSync(
    join(REPO_ROOT, "scripts", "cron", "assistant-cleanup.ts"),
    "utf8",
  );

  it("必须调用卡片构造器并发出(否则同步形同虚设)", () => {
    expect(script).toContain("buildAssistantCleanupCard");
    expect(script).toContain("buildAssistantCleanupFailureCard");
    expect(script).toContain("sendOpsAlert");
  });

  it("走运维告警出口,不得自带 fetch(通道口径统一)", () => {
    expect(script).toContain('from "./ops-alert"');
    expect(script).not.toContain("fetch(");
  });
});
