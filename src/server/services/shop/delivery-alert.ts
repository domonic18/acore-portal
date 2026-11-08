import "server-only";
import { getConfig } from "@/lib/config";
import { sendFeishuCard, type FeishuCard } from "@/server/services/shared/feishu-card";

/**
 * 发货失败告警(飞书自定义机器人):
 * 只报「订单整体落到 delivery_failed」这一档——行级失败但订单已 completed 不告警。
 * 告警通道故障绝不阻塞发货主链路(发送失败只记日志)。
 */

export type DeliveryFailureAlert = {
  orderId: string;
  username: string;
  /** 失败行(商品名 + SKU) */
  items: { name: string; sku: string }[];
  /** 失败原因摘要(已由发货侧截断) */
  error: string;
};

/** 简洁版卡片:一屏看完「谁、买了什么、为什么失败」 */
export function buildDeliveryFailureCard(input: DeliveryFailureAlert): FeishuCard {
  const itemText =
    input.items.length > 0
      ? input.items.map((i) => `${i.name}(${i.sku})`).join("、")
      : "(无)";
  return {
    title: "商城发货失败",
    template: "red",
    fields: [
      { label: "订单号", value: input.orderId },
      { label: "用户", value: input.username },
      { label: "商品", value: itemText },
      { label: "时间", value: new Date().toLocaleString("zh-CN", { hour12: false }) },
    ],
    body: `**失败原因**\n${input.error || "(未记录)"}`,
    note: "老克塔运营告警 · 请到后台订单页人工补发",
  };
}

/** 发送发货失败告警;未启用/未配置 webhook 时静默跳过 */
export async function sendDeliveryFailureAlert(input: DeliveryFailureAlert): Promise<void> {
  const { feishuAlertEnabled, feishuWebhookUrl, feishuWebhookSecret } = (await getConfig()).notify;
  if (!feishuAlertEnabled || !feishuWebhookUrl) return;
  const result = await sendFeishuCard(
    feishuWebhookUrl,
    feishuWebhookSecret || null,
    buildDeliveryFailureCard(input),
  );
  if (!result.ok && result.reason !== "not_configured") {
    console.error("[feishu-alert] 发货失败告警发送失败:", result.reason, result.detail ?? "");
  }
}
