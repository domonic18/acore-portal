import "server-only";
import { rawExecuteCommand } from "./client";

export type SoapCheck = {
  ok: boolean;
  latencyMs: number;
  error?: string;
};

/**
 * SOAP 通道探活:直连传输层,不落 soap_call/audit(health 不是业务调用)。
 * worldserver 未开属预期状态,调用方仅标记 degraded,不得阻塞启动(契约规则5)。
 */
export async function checkSoap(timeoutMs = 3000): Promise<SoapCheck> {
  const startedAt = Date.now();
  try {
    await rawExecuteCommand(".server info", timeoutMs);
    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
