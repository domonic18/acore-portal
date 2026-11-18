import "server-only";

import { CATALOG_TOOLS } from "./catalog-tools";
import { SITE_TOOLS } from "./site-tools";
import type { McpToolDef } from "./shared";

/**
 * MCP 工具注册表(二期 M6;规格 §17.2)
 *
 * **MCP 是后台商品能力的对外投影**:不另写一套 CRUD——
 * 所有写入都走 services/catalog 的同一入口(saveProduct / setProductStatus),
 * 且**不因调用方是 AI 而放松校验**(SKU↔物品绑定、服务类处理器注册表、限购、
 * 可堆叠 `_stack` 后缀一律照旧)。
 *
 * 不可逆操作(删档)不暴露给 MCP。
 *
 * 工具作用域:read 工具只读;write 工具会改商品数据——
 * 只读令牌调用写工具在路由层直接 403(不靠这里兜底)。
 *
 * 目录分工:商品类工具在 catalog-tools.ts,站内检索在 site-tools.ts,
 * 公共骨架与错误映射在 shared.ts;本文件只做汇总与按名查表。
 */

export const MCP_TOOLS: McpToolDef[] = [...CATALOG_TOOLS, ...SITE_TOOLS];

/** 工具名 → 定义(路由层按名查作用域) */
export function findMcpTool(name: string): McpToolDef | undefined {
  return MCP_TOOLS.find((t) => t.name === name);
}

export { toMcpFailure } from "./shared";
export type { McpToolContext, McpToolDef, McpToolOutcome } from "./shared";
