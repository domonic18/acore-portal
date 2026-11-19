import type { FeishuCard } from "../../src/server/services/shared/feishu-card";
import { formatDateTime } from "../../src/lib/format";

/**
 * 积分日终对账的飞书同步卡片(2026-11-19):
 *
 * 对账是无人值守的定时任务,「有差异」时若只落日志 + 退出码,站内没人看得见
 * ⇒ 差异同步飞书(红卡),无差异同步一张蓝卡(兼作「任务确实在跑」的心跳,
 * 否则「账实一致」与「任务没跑」长得一样)。
 *
 * 口径:
 * - 只落数量与差异明细(账号 id + 余额两值),不带任何凭据;
 * - 明细条数封顶(卡片过长会被飞书截断),条数以字段给出全量;
 * - 告警通道故障只记日志,绝不改变对账本身的结论与退出码。
 */

export type ReconcileDiff = {
  userId: string;
  stored: number;
  computed: number;
};

/** 卡片里最多列出的差异明细条数 */
const MAX_DETAIL_LINES = 10;

export type ReconcilePointsCardInput = {
  /** 差异明细(全部差异,卡片只列前若干条) */
  diffs: ReconcileDiff[];
  /** 参与对账的账户总数 */
  accounts: number;
  at?: Date;
};

/** 对账完成卡片:有差异走红,无差异走蓝(两者都是「跑过了」的正向信号) */
export function buildReconcilePointsCard(input: ReconcilePointsCardInput): FeishuCard {
  const hasDiff = input.diffs.length > 0;
  const details = input.diffs
    .slice(0, MAX_DETAIL_LINES)
    .map((d) => `\`${d.userId}\` 账面 ${d.stored} / 实算 ${d.computed}`);

  return {
    title: hasDiff ? `积分对账发现差异（${input.diffs.length} 处）` : "积分对账正常",
    template: hasDiff ? "red" : "blue",
    fields: [
      { label: "差异处数", value: `${input.diffs.length} 处` },
      { label: "账户总数", value: `${input.accounts} 个` },
      { label: "完成时间", value: formatDateTime(input.at ?? new Date()) },
    ],
    body: hasDiff
      ? `**差异明细**\n${details.join("\n")}${
          input.diffs.length > MAX_DETAIL_LINES
            ? `\n…另有 ${input.diffs.length - MAX_DETAIL_LINES} 处,详见对账日志`
            : ""
        }`
      : "**结论**\n全部账户账实一致,无需处理。",
    note: hasDiff
      ? "老克塔运营告警 · 积分对账 · 差异只报告不自动修复,需人工确认后重算账本"
      : "老克塔运营告警 · 积分对账",
  };
}

export type ReconcilePointsFailureCardInput = {
  /** 失败原因摘要 */
  reason: string;
  at?: Date;
};

/** 对账失败卡片(红):任务失败必须让人看见 */
export function buildReconcilePointsFailureCard(
  input: ReconcilePointsFailureCardInput,
): FeishuCard {
  return {
    title: "积分对账失败",
    template: "red",
    fields: [{ label: "失败时间", value: formatDateTime(input.at ?? new Date()) }],
    body: `**失败原因**\n${input.reason || "(未记录)"}`,
    note: "老克塔运营告警 · 请检查宿主 crontab 与对账日志",
  };
}
