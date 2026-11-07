import "server-only";
import type { NextRequest } from "next/server";
import type { NextResponse } from "next/server";
import { apiError } from "@/server/http";
import { getConfig } from "@/lib/config";

/**
 * 写请求的来源校验(CSRF 第一道闸,2026-11-07):
 * 浏览器对所有非 GET 请求必带 Origin,跨源时 Origin 与本站不同 → 直接 403;
 * 显式带 Origin/Referer 的请求一律按「必须同源」判定。
 *
 * 边界:Origin 与 Referer 都缺失 → 判定为非浏览器客户端(脚本 / 服务端调用 / 测试),
 * 这类请求拿不到受害者的 HttpOnly Cookie(CSRF 的前提),故放行;
 * 同源浏览器请求必然带 Origin(同源 POST 也带),因此浏览器侧 CSRF 面被完整挡死。
 *
 * 允许来源 = 请求自身 Host + 后台配置的站点地址(app.url):
 * 反代改写 Host 时靠 app.url 认出同源;app.url 是后台配置项,跨源浏览器无法影响。
 */

export type OriginGuardResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

/** 只认 http/https 的绝对来源;相对路径与 "null" 一律无效 */
export function normalizeOrigin(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url.origin;
}

/** 允许来源集合:Host 候选(带 http/https 两种协议)+ 站点配置地址 */
export function collectAllowedOrigins(
  headers: Headers,
  appUrl: string | null,
): string[] {
  const allowed = new Set<string>();
  const host = headers.get("host")?.split(",")[0]?.trim();
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  const app = normalizeOrigin(appUrl);
  if (app) allowed.add(app);
  return [...allowed];
}

/** 后台配置的站点地址;配置不可用时退化为「只看 Host」,不因配置故障把正常请求全拒 */
async function readAppUrl(): Promise<string | null> {
  try {
    const cfg = await getConfig();
    return cfg.app.url;
  } catch {
    return null;
  }
}

/** 纯判定:来源是否落在允许集合内(不触 DB,可单测) */
export function isSameOriginRequest(
  headers: Headers,
  appUrl: string | null,
): boolean {
  const origin = headers.get("origin");
  const referer = headers.get("referer");
  // Origin 与 Referer 都缺失 → 非浏览器客户端(脚本/测试),拿不到 HttpOnly Cookie,不构成 CSRF
  if (!origin && !referer) return true;

  const source = normalizeOrigin(origin) ?? normalizeOrigin(referer);
  if (!source) return false;

  return collectAllowedOrigins(headers, appUrl).includes(source);
}

/** 写请求入口:跨源直接 403,其余放行 */
export async function checkSameOrigin(
  req: NextRequest,
): Promise<OriginGuardResult> {
  if (isSameOriginRequest(req.headers, await readAppUrl())) return { ok: true };
  return {
    ok: false,
    response: apiError(403, "CROSS_ORIGIN_BLOCKED", "请求来源不被允许。"),
  };
}
