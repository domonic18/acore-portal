import { NextResponse } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { MCP_SCOPE } from "@/constants/mcp";
import { getConfig } from "@/lib/config";
import { RateLimitUnavailableError } from "@/lib/redis/rate-limit";
import { getClientIpOrUnknown } from "@/server/services/shared/client-ip";
import { verifyMcpToken } from "@/server/services/mcp/auth";
import { consumeMcpIpQuota, consumeMcpQuota } from "@/server/services/mcp/quota";
import { createMcpServer } from "@/server/services/mcp/server";
import { findMcpTool } from "@/server/services/mcp/tools";

/**
 * MCP 端点(二期 M6;规格 §17.4)
 *
 * 单端点 POST /api/mcp,无状态(每请求新建 Server + 传输,零会话存储)。
 *
 * 闸门顺序(先便宜后昂贵,先鉴权后计费):
 *   ① IP 兜底限速 → 429
 *   ② Bearer 令牌校验 → 401(文案统一,不区分失败原因)
 *   ③ 只读令牌调写工具 → 403
 *   ④ 令牌级 QPS / 日配额 → 429(令牌级闸失败关闭:Redis 故障即 503)
 *   ⑤ 分发给 SDK
 */

export const runtime = "nodejs";
/** 无状态端点:每个请求独立处理,禁缓存 */
export const dynamic = "force-dynamic";

/** 请求体上限:工具入参很小,256 KiB 足够 */
const MAX_BODY_BYTES = 256 * 1024;

function rpcError(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message, data: { code, ...details } },
      id: null,
    },
    { status },
  );
}

/** 取出请求体里的全部 tools/call 工具名(单条与批量都覆盖) */
function toolCallNames(body: unknown): string[] {
  const messages = Array.isArray(body) ? body : [body];
  const names: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const m = message as { method?: unknown; params?: { name?: unknown } };
    if (m.method !== "tools/call") continue;
    names.push(typeof m.params?.name === "string" ? m.params.name : "");
  }
  return names;
}

export async function POST(req: Request): Promise<Response> {
  const ip = await getClientIpOrUnknown(req);

  // ① IP 兜底闸(失败开放:Redis 抖动不该打死整个 MCP)
  const config = await getConfig();
  const ipQuota = await consumeMcpIpQuota(ip, config.mcp.ipMaxPerMin);
  if (!ipQuota.allowed) {
    return rpcError(429, "RATE_LIMITED", "请求过于频繁,请稍后重试。", {
      retryAfterSec: ipQuota.retryAfterSec,
    });
  }

  // 请求体:读一次(供配额判定 peek 用),再交给 SDK 复用
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      return rpcError(413, "PAYLOAD_TOO_LARGE", "请求体过大。");
    }
    body = JSON.parse(text);
  } catch {
    return rpcError(400, "INVALID_JSON", "请求体不是合法 JSON。");
  }

  // ② 令牌校验(失败文案统一,避免被探测)
  const authorization = req.headers.get("authorization") ?? "";
  const plain = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = await verifyMcpToken(plain);
  if (!token.ok) {
    return rpcError(401, "UNAUTHORIZED", "令牌无效。");
  }

  // ③④ 作用域 + 配额(只对真实的工具调用计费)
  const calls = toolCallNames(body);
  if (calls.length > 0) {
    for (const name of calls) {
      const tool = findMcpTool(name);
      if (tool && tool.scope === MCP_SCOPE.WRITE && token.scope === MCP_SCOPE.READ) {
        return rpcError(403, "FORBIDDEN", `只读令牌无权调用写工具 ${name}。`);
      }
    }
    try {
      for (let i = 0; i < calls.length; i += 1) {
        const quota = await consumeMcpQuota({
          tokenId: token.tokenId,
          qpsLimit: config.mcp.qpsLimit,
          dailyLimit: config.mcp.dailyLimit,
        });
        if (!quota.allowed) {
          return rpcError(
            429,
            "RATE_LIMITED",
            quota.reason === "daily" ? "今日调用次数已达上限。" : "调用过快,请稍后重试。",
            { retryAfterSec: quota.retryAfterSec },
          );
        }
      }
    } catch (err) {
      if (err instanceof RateLimitUnavailableError) {
        return rpcError(503, "RATE_LIMIT_UNAVAILABLE", "配额服务暂时不可用,请稍后重试。");
      }
      throw err;
    }
  }

  // ⑤ 分发给 SDK(无状态:每请求新建 Server + 传输)
  const server = createMcpServer({
    scope: token.scope,
    actorUserId: token.adminUserId,
    ip,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req, { parsedBody: body });
}

/** MCP 端点只收 POST(无状态 JSON 响应,不开 SSE 长连接) */
export async function GET(): Promise<Response> {
  return rpcError(405, "METHOD_NOT_ALLOWED", "仅支持 POST。");
}

export async function DELETE(): Promise<Response> {
  return rpcError(405, "METHOD_NOT_ALLOWED", "仅支持 POST。");
}
