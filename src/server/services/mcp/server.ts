import "server-only";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { MCP_TOOLS, toMcpFailure, type McpToolContext } from "./tools";

/**
 * MCP Server 组装(二期 M6;规格 §17.4)
 *
 * 无状态模式:每请求新建 McpServer + Web 标准传输
 * (sessionIdGenerator: undefined + enableJsonResponse)——
 * 换取零会话存储、零 Redis 会话依赖(与部署形态一致)。
 *
 * 每次工具调用由统一包装器计时并写审计:
 * `category=admin` / `action=mcp_tool_called`,
 * payload 只记工具名、目标 id、成败与耗时——
 * **不记令牌明文、不记请求体全文、不记错误消息正文**。
 */

export const MCP_SERVER_NAME = "lokta-shop-admin";
export const MCP_SERVER_VERSION = "1.0.0";

function textResult(payload: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    ...(isError ? { isError: true } : {}),
  };
}

export function createMcpServer(ctx: McpToolContext): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      async (args: Record<string, unknown>) => {
        const startedAt = Date.now();
        let outcome;
        try {
          outcome = await tool.run(args ?? {}, ctx);
        } catch (err) {
          outcome = toMcpFailure(err);
        }
        const durationMs = Date.now() - startedAt;

        await writeAudit({
          category: AUDIT_CATEGORY.ADMIN,
          action: AUDIT_ACTION.MCP_TOOL_CALLED,
          actorUserId: ctx.actorUserId,
          ip: ctx.ip,
          payload: outcome.ok
            ? { tool: tool.name, ok: true, targetId: outcome.targetId, durationMs }
            : { tool: tool.name, ok: false, errorCode: outcome.code, durationMs },
        });

        if (outcome.ok) return textResult(outcome.data);
        return textResult(
          { error: outcome.code, message: outcome.message, field: outcome.field ?? null },
          true,
        );
      },
    );
  }

  return server;
}
