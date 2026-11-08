import "server-only";
import { probeGameDb } from "@/lib/db/connection-probe";
import { rawExecuteCommand } from "@/server/soap/client";

/**
 * 后台「测试连接」:用**未保存的候选值**探测通道是否真的通,
 * 避免「保存了才发现连不上」。候选值里的敏感位(口令/脱敏串)由
 * settings/values 的 resolveSubmittedValue 用现值回填后再探测。
 * 探测只读不改:SOAP 发 .server info,游戏库发 SELECT 1。
 */

export type ConnectionTestResult = {
  ok: boolean;
  /** 成功=一句话结论;失败=脱敏后的原因摘要 */
  message: string;
  latencyMs: number;
};

function failed(err: unknown, startedAt: number): ConnectionTestResult {
  const raw = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    message: raw.split("\n")[0]?.slice(0, 200) || "连接失败",
    latencyMs: Date.now() - startedAt,
  };
}

/** SOAP 通道探测:.server info 是只读命令,不改游戏世界状态 */
export async function testSoapConnection(
  conn: { url: string; user: string; password: string },
  timeoutMs = 5000,
): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  try {
    await rawExecuteCommand(".server info", timeoutMs, conn);
    return { ok: true, message: "SOAP 通道连通", latencyMs: Date.now() - startedAt };
  } catch (err) {
    return failed(err, startedAt);
  }
}

/** 游戏库名(与 system_config 的 gamedb.* 键一一对应) */
export const GAME_DB_TARGETS = ["auth", "characters", "world", "eluna"] as const;
export type GameDbTarget = (typeof GAME_DB_TARGETS)[number];

/** 游戏库探测(候选连接串) */
export async function testGameDbConnection(url: string): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  const result = await probeGameDb(url);
  return { ...result, latencyMs: Date.now() - startedAt };
}
