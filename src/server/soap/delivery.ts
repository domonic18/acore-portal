import "server-only";
import { executeSoapCommand } from "./execute";

/**
 * 发货命令封装(soap-delivery 契约 §处理器注册表):
 * 全量复用 M1 通道(超时/幂等落库/审计),发货类命令副作用真实(.send items 落邮件),
 * 非天然幂等 → 不自动重试,失败转 delivery_failed 由补发路径以新幂等键重试。
 */
export function executeDeliveryCommand(
  command: Parameters<typeof executeSoapCommand>[0],
  args: string[],
  options: { idempotencyKey: string; requestedBy: string },
) {
  return executeSoapCommand(command, args, {
    idempotencyKey: options.idempotencyKey,
    idempotent: false,
    requestedBy: options.requestedBy,
  });
}
