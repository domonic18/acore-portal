import "server-only";
import { executeSoapCommand, type SoapResult } from "./execute";

/**
 * 发货命令封装(soap-delivery 契约 §处理器注册表):
 * 全量复用 M1 通道(超时/幂等落库/审计),发货类命令副作用真实(.send items 落邮件),
 * 非天然幂等 → 不自动重试;结果未知(超时/不可解析)统一标注禁止自动重发(issue #67)。
 */
export async function executeDeliveryCommand(
  command: Parameters<typeof executeSoapCommand>[0],
  args: string[],
  options: { idempotencyKey: string; requestedBy: string },
): Promise<SoapResult> {
  const result = await executeSoapCommand(command, args, {
    idempotencyKey: options.idempotencyKey,
    idempotent: false,
    requestedBy: options.requestedBy,
  });
  if (result.status === "failed" && result.outcome === "unknown") {
    return { ...result, error: `结果未知(已禁止自动重发,待人工核对): ${result.error}` };
  }
  return result;
}
