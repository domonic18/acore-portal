import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { MCP_TOOLS, findMcpTool } from "@/server/services/mcp/tools";
import {
  MCP_CONFIG_KEYS,
  MCP_DEFAULT_DAILY_LIMIT,
  MCP_DEFAULT_IP_MAX_PER_MIN,
  MCP_DEFAULT_QPS_LIMIT,
  MCP_SCOPE,
  MCP_TOKEN_PLAIN_PREFIX,
  MCP_TOOL,
} from "@/constants/mcp";

/**
 * MCP 工具注册表单测(二期 M6;规格 §17.2;M6 增补论坛运营):
 * ① 工具白名单恒为 12 个(名字与常量一致,不多不少);
 * ② 作用域标签正确(读写各归其位);
 * ③ 守卫:写入必须走 catalog/forum 同一入口,不得在工具层自写 SKU 或直连数据库。
 */

const REPO_ROOT = join(__dirname, "..", "..");
const TOOLS_DIR = join(REPO_ROOT, "src", "server", "services", "mcp", "tools");
/** 工具层源码全量(工具按职责分册,守卫扫全目录而非单文件) */
const TOOLS_SRC = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(TOOLS_DIR, f), "utf8"))
  .join("\n");

describe("MCP 工具注册表", () => {
  it("白名单恒为 12 个工具", () => {
    expect(MCP_TOOLS).toHaveLength(12);
    expect(MCP_TOOLS.map((t) => t.name).sort()).toEqual(
      [
        MCP_TOOL.LIST_PRODUCTS,
        MCP_TOOL.GET_PRODUCT,
        MCP_TOOL.CREATE_PRODUCT,
        MCP_TOOL.UPDATE_PRODUCT,
        MCP_TOOL.SET_PRODUCT_STATUS,
        MCP_TOOL.LIST_CATEGORIES,
        MCP_TOOL.SEARCH_SITE,
        MCP_TOOL.LIST_FORUM_THREADS,
        MCP_TOOL.GET_FORUM_THREAD,
        MCP_TOOL.REPLY_FORUM_THREAD,
        MCP_TOOL.UPDATE_FORUM_THREAD_TITLE,
        MCP_TOOL.DELETE_FORUM_THREAD,
      ].sort(),
    );
  });

  it("每个工具都能按名查到,且都有描述与入参形状", () => {
    for (const tool of MCP_TOOLS) {
      expect(findMcpTool(tool.name)).toBe(tool);
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeTruthy();
    }
    expect(findMcpTool("no_such_tool")).toBeUndefined();
  });

  it("作用域标签:六个写工具 + 六个只读工具", () => {
    const scopeOf = (name: string) => findMcpTool(name)?.scope;
    expect(scopeOf(MCP_TOOL.CREATE_PRODUCT)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.UPDATE_PRODUCT)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.SET_PRODUCT_STATUS)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.REPLY_FORUM_THREAD)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.UPDATE_FORUM_THREAD_TITLE)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.DELETE_FORUM_THREAD)).toBe(MCP_SCOPE.WRITE);
    expect(scopeOf(MCP_TOOL.LIST_PRODUCTS)).toBe(MCP_SCOPE.READ);
    expect(scopeOf(MCP_TOOL.GET_PRODUCT)).toBe(MCP_SCOPE.READ);
    expect(scopeOf(MCP_TOOL.LIST_CATEGORIES)).toBe(MCP_SCOPE.READ);
    expect(scopeOf(MCP_TOOL.SEARCH_SITE)).toBe(MCP_SCOPE.READ);
    expect(scopeOf(MCP_TOOL.LIST_FORUM_THREADS)).toBe(MCP_SCOPE.READ);
    expect(scopeOf(MCP_TOOL.GET_FORUM_THREAD)).toBe(MCP_SCOPE.READ);
  });

  it("不暴露不可逆操作(商品删档/论坛恢复与单删楼层)", () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(names).not.toContain("delete_product");
    expect(TOOLS_SRC).not.toContain("deleteProduct");
    // 论坛下架是可逆软删,可暴露;但恢复与单删楼层不暴露,留后台人工
    expect(names).not.toContain("undelete_forum_thread");
    expect(names).not.toContain("delete_forum_post");
    expect(TOOLS_SRC).not.toContain("undeleteThread");
    expect(TOOLS_SRC).not.toContain("deletePost");
  });
});

describe("MCP 常量", () => {
  it("配置键一律 mcp.* 前缀", () => {
    for (const key of Object.values(MCP_CONFIG_KEYS)) {
      expect(key.startsWith("mcp.")).toBe(true);
    }
  });

  it("令牌明文前缀与默认限额齐备(令牌无有效期,故无 TTL 常量)", () => {
    expect(MCP_TOKEN_PLAIN_PREFIX.startsWith("lokta_mcp_")).toBe(true);
    expect(MCP_DEFAULT_QPS_LIMIT).toBeGreaterThan(0);
    expect(MCP_DEFAULT_DAILY_LIMIT).toBeGreaterThan(0);
    expect(MCP_DEFAULT_IP_MAX_PER_MIN).toBeGreaterThan(0);
  });
});

describe("工具层接线守卫", () => {
  it("商品写入走 catalog 同一入口(不另写 CRUD)", () => {
    expect(TOOLS_SRC).toContain("saveProduct");
    expect(TOOLS_SRC).toContain("setProductStatus");
    expect(TOOLS_SRC).toContain("getAdminProduct");
  });

  it("论坛写入走 forum 同一入口(不另写 CRUD)", () => {
    expect(TOOLS_SRC).toContain("adminListThreads");
    expect(TOOLS_SRC).toContain("listThreadPosts");
    expect(TOOLS_SRC).toContain("createReply");
    expect(TOOLS_SRC).toContain("updateThreadTitle");
    expect(TOOLS_SRC).toContain("deleteThread");
  });

  it("工具层禁直连数据库", () => {
    expect(TOOLS_SRC).not.toContain("@/lib/db");
    expect(TOOLS_SRC).not.toContain("prisma.");
  });

  it("SKU 由所选物品/处理器派生,不得自写前缀", () => {
    expect(TOOLS_SRC).toContain("deriveSku");
    expect(TOOLS_SRC).toContain("deriveServiceSku");
    expect(TOOLS_SRC).not.toContain("itemsend_");
    expect(TOOLS_SRC).not.toContain("transmog-item_");
  });

  it("不因调用方是 AI 而放松校验:SKU 契约校验仍在 catalog 入口内", () => {
    expect(TOOLS_SRC).not.toContain("validateSkuBinding");
  });
});
