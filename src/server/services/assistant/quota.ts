import "server-only";

import { beijingDateKey, beijingDayStart } from "@/lib/format";
import { hitRateLimit } from "@/lib/redis/rate-limit";

/**
 * 每用户每日问答配额(M9 W6,spec §19 双层配额的用户层):
 * Redis 固定窗口,键含北京日(自然日按北京日切,口径 31 ③);
 * 配置 dailyQuota<=0 视为不限额。游客不进本层(路由层 401 拦截,即「游客关」)。
 */
export async function consumeAssistantQuota(
  userId: string,
  dailyQuota: number,
): Promise<{ allowed: boolean; count: number; retryAfterSec?: number }> {
  if (dailyQuota <= 0) return { allowed: true, count: 0 };
  const key = `assistant:quota:${userId}:${beijingDateKey()}`;
  // 窗口对齐下一个北京日零点(硬编码东八区,不依赖容器 TZ;口径 31 ④)
  const nextMidnight = beijingDayStart(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const windowSec = Math.max(1, Math.ceil((nextMidnight.getTime() - Date.now()) / 1000));
  const result = await hitRateLimit(key, { windowSec, max: dailyQuota, failOpen: true });
  return { allowed: result.allowed, count: result.count, retryAfterSec: result.retryAfterSec };
}
