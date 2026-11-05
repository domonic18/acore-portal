import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { recordNotFound } from "@/server/services/stats/not-found";

/**
 * 404 采集上报(US4 T025,FR-312/research R8):匿名公开路由。
 * path 截断 256/仅站内相对路径;IP 轻限速 30 次/分;计数写入与 TTL 收口
 * service(issue #74:键构造单一来源,TTL 覆盖看板 7 日窗口);不记 UA/referer,审计零残留。
 */
const bodySchema = z.object({ path: z.string() });

const RATE_WINDOW_SEC = 60;
const RATE_MAX = 30;

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;

  const raw = parsed.data.path;
  // 仅站内相对路径(防外域/协议相对地址污染键面);截断 256
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\n")) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:path");
  }
  const path = raw.slice(0, 256);

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;
  if (ip) {
    const limited = await hitRateLimit(`rl:404:${ip}`, {
      windowSec: RATE_WINDOW_SEC,
      max: RATE_MAX,
    });
    if (!limited.allowed) {
      return apiError(429, "RATE_LIMITED", "请求过于频繁,请稍后再试。");
    }
  }

  await recordNotFound(path);
  return apiOk({ ok: true });
}
