import "server-only";
import { getConfig } from "@/lib/config";
import { resolveClientIp, UNKNOWN_CLIENT_IP } from "@/lib/net/client-ip";

/**
 * 客户端 IP 取值(2026-11-06 撞库加固,PR-A):
 * app 层统一从这里取 IP,不再各自读 XFF 头——
 * 否则各路由取法不一(有的取左值、有的整串),攻击者可伪造头部影响限流计数。
 *
 * 纯解析在 lib/net/client-ip.ts(零依赖、可单测);此处只负责读配置 + 包装请求。
 */

/** 取真实客户端 IP;不可判定时返回 null(调用方按业务决定是否兜底) */
export async function getClientIp(req: Request): Promise<string | null> {
  const { security } = await getConfig();
  return resolveClientIp(
    req.headers.get("x-forwarded-for"),
    security.trustedProxyHops,
    req.headers.get("x-real-ip"),
  );
}

/** 取真实客户端 IP;不可判定时返回 "unknown"(计入独立限流桶,不得跳过限流) */
export async function getClientIpOrUnknown(req: Request): Promise<string> {
  return (await getClientIp(req)) ?? UNKNOWN_CLIENT_IP;
}
