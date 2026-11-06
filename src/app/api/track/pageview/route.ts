import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { normalizePagePath, recordPageView } from "@/server/services/stats/page-view";
import { getClientIp } from "@/server/services/shared/client-ip";

/**
 * 页面访问上报(自建流量统计,替代 umami):匿名公开路由。
 * path 仅站内相对路径(服务端再校验截断);IP 轻限速 30 次/分;
 * 只落 path 与访客哈希,不留原始 IP/UA/referer。
 */
const bodySchema = z.object({ path: z.string() });

const RATE_WINDOW_SEC = 60;
const RATE_MAX = 30;

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  // 站内相对路径校验 + 排除前缀 + 长度截断(与 service 同一套规则)
  const path = normalizePagePath(parsed.data.path);
  if (!path) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:path");
  }

  const ip = await getClientIp(req);
  if (ip) {
    const limited = await hitRateLimit(`rl:pview:${ip}`, {
      windowSec: RATE_WINDOW_SEC,
      max: RATE_MAX,
    });
    if (!limited.allowed) {
      return apiError(429, "RATE_LIMITED", "请求过于频繁,请稍后再试。");
    }
  }

  await recordPageView(path, ip);
  return apiOk({ ok: true });
}
