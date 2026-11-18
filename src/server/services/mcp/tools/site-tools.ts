import "server-only";

import { z } from "zod";

import { MCP_SCOPE, MCP_TOOL } from "@/constants/mcp";
import { searchSite } from "@/server/services/search";

import { defineTool, type McpToolDef } from "./shared";

/**
 * 站内检索工具分册(1 个)
 *
 * 与助手侧 `search_site` 同源(M8-a 统一检索 service 的对外投影),
 * 不另写一套检索逻辑,避免两侧口径漂移。
 */

const searchSiteSchema = z.object({
  q: z.string().min(1).describe("检索关键词或问句"),
  limitPerGroup: z.number().int().positive().max(20).optional().describe("每组返回条数(上限 20)"),
});

export const SITE_TOOLS: McpToolDef[] = [
  defineTool({
    name: MCP_TOOL.SEARCH_SITE,
    title: "检索站内内容",
    description:
      "检索本站内容(攻略/使用说明/规范/商品/论坛主题)。回答站点相关问题或找商品线索前先用它检索。",
    scope: MCP_SCOPE.READ,
    schema: searchSiteSchema,
    run: async (args) => {
      const result = await searchSite({
        q: args.q,
        limitPerGroup: args.limitPerGroup ?? 5,
      });
      const groups = result.groups
        .filter((g) => g.hits.length > 0)
        .map((g) => ({
          group: g.hits[0]?.groupLabel ?? g.group,
          hits: g.hits.map((h) => ({
            title: h.title,
            url: h.url,
            snippet: h.snippet,
          })),
        }));
      return {
        ok: true,
        data: { semantic: result.semantic, total: result.total, groups },
      };
    },
  }),
];
