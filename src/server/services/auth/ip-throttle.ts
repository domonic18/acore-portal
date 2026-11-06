import "server-only";
import { getConfig } from "@/lib/config";
import { hitRateLimit, RateLimitUnavailableError } from "@/lib/redis/rate-limit";
import { UNKNOWN_CLIENT_IP } from "@/lib/net/client-ip";

/**
 * 未鉴权端点的按 IP 限速(2026-11-06 撞库加固 PR-G):
 * 注册 / 找回密码 / 换邮箱确认都是「无凭证 + 会打 DB」的入口,
 * 攻击者可用它们放大查询量并做邮箱轰炸。
 *
 * 与登录域(IP 维锁)的区别:这里不锁任何账号,只按来源 IP 计数——
 * 越阈只影响该 IP 自己的请求。
 */

export type IpThrottleResult =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited"; retryAfterSec: number }
  /** Redis 不可用:计数无从谈起,失败关闭(调用方回 503,不得静默放行) */
  | { allowed: false; reason: "unavailable" };

/**
 * 按客户端 IP 限速。
 *
 * IP 不可判定(代理未配置/直连)时,所有请求会落进同一个共享桶——
 * 此时阈值改用 `security.unknownIpMaxPerHour`(远宽于按 IP 阈值):
 * 既不放弃限速,也不因一次代理配置错误把全站用户并成一个桶而误伤。
 *
 * 计数固定失败关闭(failOpen=false):被攻击面在 Redis 故障时静默放行,
 * 等于限流形同虚设;此处把故障折成 `unavailable` 结果,由调用方翻译成 503。
 */
export async function throttleByClientIp(input: {
  ip?: string | null;
  /** 桶键构造器(来自 constants/security.ts) */
  keyFor: (bucket: string) => string;
  /** IP 可判定时的阈值 */
  max: number;
  windowSec: number;
}): Promise<IpThrottleResult> {
  const { security } = await getConfig();
  const known = typeof input.ip === "string" && input.ip.length > 0;
  const bucket = input.ip ?? UNKNOWN_CLIENT_IP;
  const max = known ? input.max : security.unknownIpMaxPerHour;
  try {
    const result = await hitRateLimit(input.keyFor(bucket), {
      windowSec: input.windowSec,
      max,
      failOpen: false,
    });
    if (result.allowed) return { allowed: true };
    return {
      allowed: false,
      reason: "rate_limited",
      retryAfterSec: result.retryAfterSec ?? input.windowSec,
    };
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return { allowed: false, reason: "unavailable" };
    }
    throw err;
  }
}
