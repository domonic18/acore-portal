import "server-only";

import { tool } from "@langchain/core/tools";
import { z } from "zod";

import { searchSite } from "@/server/services/search";

/**
 * 站内检索工具(M9 W6):唯一工具,内部走 searchSite 单一收口(spec §19);
 * 结果页降级态列表与未来 MCP 共用同一函数。
 * 返回 JSON 字符串(带 url/title/snippet),供模型引用为站内来源链接。
 */
export const searchSiteTool = tool(
  async ({ q }) => {
    const result = await searchSite({ q, limitPerGroup: 5 });
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
    return JSON.stringify({
      semantic: result.semantic,
      total: result.total,
      groups,
    });
  },
  {
    name: "search_site",
    description:
      "检索本站内容(攻略/使用说明/规范/商品/论坛主题)。回答站点相关问题前先用本工具检索,引用结果时附上返回的站内链接。",
    schema: z.object({
      q: z.string().min(1).describe("检索关键词或问句"),
    }),
  },
);
