import "server-only";

import { getConfig } from "@/lib/config";
import { AUDIT_ACTION } from "@/constants/audit";
import type { McpAdminView } from "@/constants/mcp";
import { queryAuditLog } from "@/server/services/shared/audit";
import { readMcpTokenView } from "./auth";
import { readMcpDailyUsage } from "./quota";

/**
 * 后台令牌页视图(二期 M6)
 *
 * 令牌视图只回「已配置」布尔 + 前缀 + 作用域 + 有效期 + 签发时刻,
 * 永不回哈希/明文(规则 12 只写不读口径)。
 * 最近调用取 audit_log 的 mcp_tool_called 事件——只记工具名/目标 id/成败/耗时。
 */

export async function readMcpAdminView(): Promise<McpAdminView> {
  const [token, config] = await Promise.all([readMcpTokenView(), getConfig()]);
  const tokenId = config.mcp.tokenHash ? config.mcp.tokenHash.slice(0, 12) : null;
  const todayCalls = tokenId ? (await readMcpDailyUsage(tokenId)).count : 0;

  const recent = await queryAuditLog({
    action: AUDIT_ACTION.MCP_TOOL_CALLED,
    limit: 20,
  });

  return {
    token,
    todayCalls,
    recentCalls: recent.items.map((item) => ({
      id: item.id,
      tool: typeof item.payload.tool === "string" ? item.payload.tool : "",
      ok: item.payload.ok === true,
      targetId: typeof item.payload.targetId === "string" ? item.payload.targetId : null,
      durationMs: typeof item.payload.durationMs === "number" ? item.payload.durationMs : null,
      createdAt: item.createdAt,
    })),
  };
}
