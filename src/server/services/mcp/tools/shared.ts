import "server-only";

import { z } from "zod";

import type { McpScopeValue } from "@/constants/mcp";
import { ProductAdminError } from "@/server/services/catalog/admin/shared";
import { GameDbError } from "@/server/services/shared/game-identity";

/**
 * MCP 工具定义的公共骨架(工具注册表各分册共用)
 *
 * 类型与辅助函数与具体工具分册分离:工具层只描述「入参形状 + 作用域 + 执行」,
 * 校验、SKU 派生与错误映射统一走本模块,避免各分册各写一套。
 */

export type McpToolContext = {
  /** 令牌作用域 */
  scope: McpScopeValue;
  /** 令牌绑定的管理员身份(审计 actor) */
  actorUserId: bigint | null;
  /** 调用来源 IP */
  ip: string | null;
};

export type McpToolOutcome =
  | { ok: true; data: unknown; targetId?: string }
  | { ok: false; code: string; message: string; field?: string };

export type McpToolDef = {
  name: string;
  title: string;
  description: string;
  scope: McpScopeValue;
  /** 交给 SDK registerTool 的入参形状(zod raw shape) */
  inputSchema: z.ZodRawShape;
  run: (args: Record<string, unknown>, ctx: McpToolContext) => Promise<McpToolOutcome>;
};

/** 保留具体 zod 推断,避免工具入参退化成 any */
export function defineTool<S extends z.ZodObject<z.ZodRawShape>>(def: {
  name: string;
  title: string;
  description: string;
  scope: McpScopeValue;
  schema: S;
  run: (args: z.infer<S>, ctx: McpToolContext) => Promise<McpToolOutcome>;
}): McpToolDef {
  return {
    name: def.name,
    title: def.title,
    description: def.description,
    scope: def.scope,
    inputSchema: def.schema.shape as z.ZodRawShape,
    run: (args, ctx) => def.run(def.schema.parse(args), ctx),
  };
}

/** 工具入参里的 id:字符串或数字均可,非法即 422 */
export type ParsedId =
  | { ok: true; id: bigint }
  | { ok: false; code: string; message: string; field: string };

export function parseId(value: string | number, field = "id"): ParsedId {
  try {
    const id = BigInt(value);
    if (id <= 0n) {
      return { ok: false, code: "VALIDATION_FAILED", message: "id 必须是正整数。", field };
    }
    return { ok: true, id };
  } catch {
    return { ok: false, code: "VALIDATION_FAILED", message: "id 必须是整数。", field };
  }
}

/** slug 兜底:未给别名时由 SKU 派生(ASCII 安全) */
export function slugFromSku(sku: string): string {
  const s = sku
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || `product-${Date.now()}`;
}

/** 领域异常 → 工具失败结果(统一错误口径) */
export function toMcpFailure(err: unknown): McpToolOutcome {
  if (err instanceof ProductAdminError) {
    return { ok: false, code: err.code, message: err.message, field: err.field };
  }
  if (err instanceof GameDbError) {
    return {
      ok: false,
      code: "GAME_DB_UNAVAILABLE",
      message: "游戏物品库不可用,请稍后重试。",
    };
  }
  return {
    ok: false,
    code: "INTERNAL_ERROR",
    message: err instanceof Error ? err.message : "工具执行失败。",
  };
}
