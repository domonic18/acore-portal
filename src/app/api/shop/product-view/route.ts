import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { recordProductView } from "@/server/services/shared/conversion";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { pageviewIpKey } from "@/constants/security";

/**
 * 商品浏览上报(转化漏斗第一环):匿名公开路由,仿 404 采集
 * (zod 校验→IP 轻限速 30 次/分→商品存在性);失败静默不影响页面。
 */
const bodySchema = z.object({ productId: z.coerce.number().int().positive() });

const RATE_WINDOW_SEC = 60;
const RATE_MAX = 30;

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const { security } = await getConfig();
  const ip = await getClientIp(req);
  // IP 不可判定时落共享兜底桶(不放弃限速);Redis 故障失败关闭 503
  const gate = await throttleByClientIp({
    ip,
    keyFor: pageviewIpKey,
    max: RATE_MAX,
    windowSec: RATE_WINDOW_SEC,
    unknownMax: security.trackUnknownIpMaxPerMin,
  });
  if (!gate.allowed) {
    if (gate.reason === "unavailable") {
      return apiError(503, "TRACK_UNAVAILABLE", "上报服务暂时不可用,请稍后再试。");
    }
    return apiError(429, "RATE_LIMITED", "请求过于频繁,请稍后再试。", {
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const recorded = await recordProductView(BigInt(parsed.data.productId));
  if (!recorded) return apiError(404, "PRODUCT_NOT_FOUND", "商品不存在。");
  return apiOk({ ok: true });
}
