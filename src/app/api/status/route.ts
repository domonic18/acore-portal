import "server-only";
import type { NextRequest } from "next/server";
import { apiError } from "@/server/http";
import { getServerStatus } from "@/server/services/status/status";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { hitRateLimit, RateLimitUnavailableError } from "@/lib/redis/rate-limit";
import { getConfig } from "@/lib/config";
import { STATUS_WINDOW_SEC, statusGlobalKey, statusIpKey } from "@/constants/security";

// 实时状态查询,禁止构建期静态预渲染(否则 next build 需要真实 DB)
export const dynamic = "force-dynamic";

/** 限速/故障的用户可见文案(两处闸共用,不暴露内部细节) */
const RATE_LIMIT_429 = "状态查询过于频繁,请稍后再试。";
const UNAVAILABLE_503 = "状态服务暂时不可用,请稍后再试。";

/** 公开状态聚合(契约 server-status.md:无鉴权,聚合统计非敏感,角色明细不出库) */
export async function GET(req: NextRequest) {
  const { security, status } = await getConfig();
  // 状态功能关闭:直接短路,不占限流额度
  if (!status.enabled) return Response.json({ enabled: false });

  const ip = await getClientIp(req);
  const perIp = await throttleByClientIp({
    ip,
    keyFor: statusIpKey,
    max: security.statusIpMaxPerMin,
    windowSec: STATUS_WINDOW_SEC,
    unknownMax: security.statusUnknownIpMaxPerMin,
  });
  if (!perIp.allowed) {
    if (perIp.reason === "unavailable") {
      return apiError(503, "STATUS_UNAVAILABLE", UNAVAILABLE_503);
    }
    return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
      retryAfterSec: perIp.retryAfterSec,
    });
  }

  // 全局闸:不限单 IP 也能护住 worldserver 与 characters 库
  try {
    const global = await hitRateLimit(statusGlobalKey(), {
      windowSec: STATUS_WINDOW_SEC,
      max: security.statusGlobalMaxPerMin,
      failOpen: false,
    });
    if (!global.allowed) {
      return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
        retryAfterSec: global.retryAfterSec,
      });
    }
  } catch (err) {
    if (err instanceof RateLimitUnavailableError) {
      return apiError(503, "STATUS_UNAVAILABLE", UNAVAILABLE_503);
    }
    throw err;
  }

  return Response.json(await getServerStatus());
}
