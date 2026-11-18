import "server-only";

import { beijingDayStart } from "@/lib/format";

import { getTodayTokens } from "./usage";

/**
 * 站点当日 Token 总限额(2026-11-18 用户裁决:不做每用户限额,只做全站日闸):
 * 检查读 `assistant_usage` 当日聚合(单一真相源,run 收尾已 upsert),
 * 上限为 chat 绑定的 dailyTokenMax(0=不限额)。Token 数在流式响应结束
 * 才可知,故为「检查放行、run 收尾记账、下一轮拦截」——并发在途请求可能
 * 小幅超越上限,属可接受取舍(成本护栏,非账务不变量)。
 */
export async function checkSiteTokenQuota(
  maxTokens: number,
): Promise<{ allowed: boolean; usedTokens: number; retryAfterSec?: number }> {
  const usedTokens = await getTodayTokens();
  if (maxTokens <= 0 || usedTokens < maxTokens) {
    return { allowed: true, usedTokens };
  }
  // 窗口对齐下一个北京日零点(硬编码东八区,不依赖容器 TZ;口径 31 ④)
  const nextMidnight = beijingDayStart(new Date(Date.now() + 24 * 60 * 60 * 1000));
  return {
    allowed: false,
    usedTokens,
    retryAfterSec: Math.max(1, Math.ceil((nextMidnight.getTime() - Date.now()) / 1000)),
  };
}
