import "server-only";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { apiError, apiOk, parseBody } from "@/server/http";
import { redis } from "@/lib/redis";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { recordProductView } from "@/server/services/shared/conversion";

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

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  if (ip) {
    const limited = await hitRateLimit(`rl:pview:${ip}`, {
      windowSec: RATE_WINDOW_SEC,
      max: RATE_MAX,
    });
    if (!limited.allowed) {
      return apiError(429, "RATE_LIMITED", "请求过于频繁,请稍后再试。");
    }
  }

  const recorded = await recordProductView(BigInt(parsed.data.productId));
  if (!recorded) return apiError(404, "PRODUCT_NOT_FOUND", "商品不存在。");
  return apiOk({ ok: true });
}
