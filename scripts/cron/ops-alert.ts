import { sendFeishuCard, type FeishuCard } from "../../src/server/services/shared/feishu-card";
import type { SystemConfig } from "../../src/lib/config";

/**
 * 运维告警出口(cron 备份 / 心跳检查 / 恢复演练 / 助手会话清理共用):
 * 通道配置取 system_config 的 notify.*(后台「设置」可改,免重启);
 * 未配置或通道故障一律降级为「只记日志」——告警坏掉绝不能连带主流程失败。
 */

export type OpsAlertOutcome = "sent" | "skipped" | "failed";

/**
 * 发一张运维告警卡片。
 * skipped = 通道未启用/未配置(降级模式);failed = 通道故障(已重试过,仍失败)。
 */
export async function sendOpsAlert(cfg: SystemConfig, card: FeishuCard): Promise<OpsAlertOutcome> {
  const notify = cfg.notify;
  if (!notify.feishuAlertEnabled || !notify.feishuWebhookUrl) return "skipped";
  const result = await sendFeishuCard(
    notify.feishuWebhookUrl,
    notify.feishuWebhookSecret || null,
    card,
  );
  return result.ok ? "sent" : "failed";
}

/** 告警发送结果的日志口径(不打印任何凭据) */
export function describeAlert(outcome: OpsAlertOutcome): string {
  switch (outcome) {
    case "sent":
      return "已发送";
    case "skipped":
      return "未配置通道(notify.feishuAlertEnabled/feishuWebhookUrl),仅记录日志";
    case "failed":
      return "通道故障,仅记录日志";
  }
}
