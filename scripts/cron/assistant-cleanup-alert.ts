import type { FeishuCard } from "../../src/server/services/shared/feishu-card";
import { formatDateTime } from "../../src/lib/format";

/**
 * 助手会话清理的飞书同步卡片(2026-11-18):
 *
 * 清理任务是无人值守的定时任务(周频),跑没跑、回收了多少、有没有失败,
 * 运维在站内看不出来 ⇒ 结果同步到飞书。
 *
 * 口径:
 * - 每次跑都发一张(有回收=绿 / 无超期=蓝)⇒ 兼作「清理任务确实在跑」的心跳,
 *   否则「无事可清」与「任务没跑」在飞书里长得一样;
 * - 失败发红卡(清理本身不因告警失败而中断,退出码仍非零);
 * - 只落数量与时间,对话正文不入卡片(沿用 T048 脱敏口径)。
 */

export type AssistantCleanupCardInput = {
  /** 回收的会话数 */
  threads: number;
  /** 一并删除的行数(检查点 + 中间写 + 台账) */
  rows: number;
  /** 保留期(天) */
  retentionDays: number;
  /** 判定超期的截止时刻 */
  cutoff: string | Date;
  at?: Date;
};

/** 清理完成卡片:有回收走绿,无超期走蓝(两者都是「跑过了」的正向信号) */
export function buildAssistantCleanupCard(input: AssistantCleanupCardInput): FeishuCard {
  const reclaimed = input.threads > 0;
  return {
    title: reclaimed ? "助手会话清理完成" : "助手会话清理完成(无超期会话)",
    template: reclaimed ? "green" : "blue",
    fields: [
      { label: "回收会话", value: `${input.threads} 个` },
      { label: "删除行数", value: `${input.rows} 行` },
      { label: "保留期", value: `${input.retentionDays} 天` },
      { label: "判定截止", value: formatDateTime(input.cutoff) },
      { label: "完成时间", value: formatDateTime(input.at ?? new Date()) },
    ],
    body: reclaimed
      ? "**结论**\n沉睡会话已回收,检查点表随台账一并瘦身。"
      : "**结论**\n无超期会话,本次未删除任何数据。",
    note: "老克塔运营告警 · 助手会话数据生命周期",
  };
}

export type AssistantCleanupFailureCardInput = {
  /** 失败原因摘要 */
  reason: string;
  at?: Date;
};

/** 清理失败卡片(红):定时任务失败必须让人看见 */
export function buildAssistantCleanupFailureCard(
  input: AssistantCleanupFailureCardInput,
): FeishuCard {
  return {
    title: "助手会话清理失败",
    template: "red",
    fields: [{ label: "失败时间", value: formatDateTime(input.at ?? new Date()) }],
    body: `**失败原因**\n${input.reason || "(未记录)"}`,
    note: "老克塔运营告警 · 请检查宿主 crontab 与清理日志",
  };
}
