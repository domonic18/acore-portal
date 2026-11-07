import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { normalizePagePath, recordPageView } from "@/server/services/stats/page-view";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { pageviewIpKey } from "@/constants/security";

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

  await recordPageView(path, ip);
  return apiOk({ ok: true });
}
