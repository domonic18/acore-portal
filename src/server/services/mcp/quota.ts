import "server-only";
import { hitRateLimit, readRateLimit } from "@/lib/redis/rate-limit";
import { beijingDateKey, beijingDayStart } from "@/lib/format";

/**
 * MCP 配额与限速(二期 M6;规格 §17.5)
 *
 * 三道闸:
 * - 令牌级 QPS(窗口 1 秒)——令牌级闸**失败关闭**:Redis 故障即 503,绝不放开无限调用;
 * - 令牌级日配额(窗口 = 到次日北京零点)——同样失败关闭;
 * - 未鉴权请求的 IP 兜底闸(窗口 60 秒)——**失败开放**:Redis 抖动不该打死整个 MCP,
 *   但它只是兜底,不能当配额用。
 */

export type McpQuotaDenial = {
  allowed: false;
  reason: "qps" | "daily" | "ip";
  retryAfterSec: number;
};

export type McpQuotaResult = { allowed: true } | McpQuotaDenial;

/** 到次日北京零点的秒数(日配额窗口) */
export function secondsToNextBeijingMidnight(now: Date = new Date()): number {
  const nextMidnight = beijingDayStart(new Date(now.getTime() + 24 * 3600 * 1000));
  return Math.max(1, Math.ceil((nextMidnight.getTime() - now.getTime()) / 1000));
}

export function mcpQpsKey(tokenId: string): string {
  return `rl:mcp:qps:${tokenId}`;
}

export function mcpDailyKey(tokenId: string, now: Date = new Date()): string {
  return `rl:mcp:day:${tokenId}:${beijingDateKey(now)}`;
}

export function mcpIpKey(ip: string): string {
  return `rl:mcp-ip:${ip}`;
}

/** 令牌级两道闸:QPS 先(窗口短、拒得快),再扣日配额;任一不过即拒 */
export async function consumeMcpQuota(opts: {
  tokenId: string;
  qpsLimit: number;
  dailyLimit: number;
}): Promise<McpQuotaResult> {
  const qps = await hitRateLimit(mcpQpsKey(opts.tokenId), {
    windowSec: 1,
    max: opts.qpsLimit,
    failOpen: false,
  });
  if (!qps.allowed) {
    return { allowed: false, reason: "qps", retryAfterSec: qps.retryAfterSec ?? 1 };
  }

  const daily = await hitRateLimit(mcpDailyKey(opts.tokenId), {
    windowSec: secondsToNextBeijingMidnight(),
    max: opts.dailyLimit,
    failOpen: false,
  });
  if (!daily.allowed) {
    return {
      allowed: false,
      reason: "daily",
      retryAfterSec: daily.retryAfterSec ?? secondsToNextBeijingMidnight(),
    };
  }

  return { allowed: true };
}

/** 未鉴权请求的 IP 兜底闸(失败开放) */
export async function consumeMcpIpQuota(ip: string, max: number): Promise<McpQuotaResult> {
  const res = await hitRateLimit(mcpIpKey(ip), { windowSec: 60, max, failOpen: true });
  if (!res.allowed) {
    return { allowed: false, reason: "ip", retryAfterSec: res.retryAfterSec ?? 60 };
  }
  return { allowed: true };
}

/** 今日已用量(不增长)——后台「今日调用数」用 */
export async function readMcpDailyUsage(
  tokenId: string,
  now: Date = new Date(),
): Promise<{ count: number }> {
  const usage = await readRateLimit(mcpDailyKey(tokenId, now));
  return { count: usage.count };
}
