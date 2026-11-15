import "server-only";
import { probeCos } from "@/lib/cos/probe";
import { probeGameDb } from "@/lib/db/connection-probe";
import { formatDateTime } from "@/lib/format";
import { sendFeishuCard } from "@/server/services/shared/feishu-card";
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

/** COS 探测(候选桶名与凭据):headBucket 只读桶元信息 */
export async function testCosConnection(params: {
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
}): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  const result = await probeCos(params);
  return { ...result, latencyMs: Date.now() - startedAt };
}

/**
 * 飞书告警通道探测(候选 Webhook 地址与签名密钥):真发一张测试卡片——
 * 飞书通道只有「实际收到卡片」才算连通,握手类探测证明不了签名与地址都对。
 * 通道未启用开关时照样能测(测的是通道本身);开关状态由界面另行提示。
 */
export async function testFeishuAlertChannel(params: {
  webhookUrl: string;
  webhookSecret: string;
}): Promise<ConnectionTestResult> {
  const startedAt = Date.now();
  if (!params.webhookUrl) {
    return { ok: false, message: "未配置 Webhook 地址,无法测试", latencyMs: 0 };
  }
  const result = await sendFeishuCard(params.webhookUrl, params.webhookSecret || null, {
    title: "告警通道测试",
    template: "green",
    fields: [
      { label: "来源", value: "门户后台 · 设置 › 通知" },
      { label: "时间", value: formatDateTime(new Date()) },
    ],
    body: "收到本卡片即说明 **Webhook 地址** 与 **签名密钥** 可用。",
    note: "通道测试 · 老克塔门户",
  });
  const latencyMs = Date.now() - startedAt;
  if (result.ok) {
    return { ok: true, message: "测试卡片已发送(请到飞书群确认收到)", latencyMs };
  }
  const why =
    result.reason === "not_configured"
      ? "未配置 Webhook 地址"
      : result.reason === "rejected"
        ? "飞书拒绝了请求(Webhook 地址或签名密钥有误)"
        : "无法连接飞书";
  return {
    ok: false,
    message: result.detail ? `${why}:${result.detail}` : why,
    latencyMs,
  };
}
