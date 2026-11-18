/**
 * 商品运营 MCP 常量(二期 M6;规格 §17):
 *
 * MCP 是后台商品能力的对外投影——工具只暴露白名单内的动作,
 * 写入一律走 services/catalog 的同一入口,不因调用方是 AI 而放松校验。
 *
 * 令牌口径:长期访问令牌(Bearer)按「只写不读」处理,库中仅存 SHA-256 哈希;
 * 明文只在签发响应里出现一次。签发即覆盖旧令牌 ⇒ 同时只有一枚活跃令牌。
 */

/** 令牌作用域:只读 / 可写 */
export const MCP_SCOPE = {
  READ: "read",
  WRITE: "write",
} as const;

export type McpScopeValue = (typeof MCP_SCOPE)[keyof typeof MCP_SCOPE];

/** 工具白名单(白名单外一律拒绝;tools/list 即返回此清单) */
export const MCP_TOOL = {
  LIST_PRODUCTS: "list_products",
  GET_PRODUCT: "get_product",
  CREATE_PRODUCT: "create_product",
  UPDATE_PRODUCT: "update_product",
  SET_PRODUCT_STATUS: "set_product_status",
  LIST_CATEGORIES: "list_categories",
  /** 站内检索(M8-a 统一检索 service 的同源投影,与 AI 助手侧同一函数) */
  SEARCH_SITE: "search_site",
} as const;

export type McpToolName = (typeof MCP_TOOL)[keyof typeof MCP_TOOL];

/** system_config 的 mcp 组键名(令牌状态 + 限额) */
export const MCP_CONFIG_KEYS = {
  /** 令牌 SHA-256 哈希(明文永不落库、永不回显) */
  tokenHash: "mcp.tokenHash",
  /** 令牌明文前缀(后台识别用,非机密) */
  tokenPrefix: "mcp.tokenPrefix",
  /** 作用域:read | write */
  tokenScope: "mcp.tokenScope",
  /** 过期时刻(ISO) */
  tokenExpiresAt: "mcp.tokenExpiresAt",
  /** 签发时刻(ISO) */
  tokenIssuedAt: "mcp.tokenIssuedAt",
  /** 绑定的管理员身份(审计 actor) */
  tokenAdminUserId: "mcp.tokenAdminUserId",
  /** 每令牌每秒调用上限 */
  qpsLimit: "mcp.qpsLimit",
  /** 每令牌每日调用上限(北京时间日切) */
  dailyLimit: "mcp.dailyLimit",
  /** 未鉴权请求的 IP 兜底闸(次/分) */
  ipMaxPerMin: "mcp.ipMaxPerMin",
} as const;

/** 令牌明文前缀:后台回显前 12 位便于人工识别 */
export const MCP_TOKEN_PLAIN_PREFIX = "lokta_mcp_";

/** 令牌默认有效期(天):后台签发时可改 */
export const MCP_DEFAULT_TOKEN_TTL_DAYS = 90;

/** 默认限额:配置键缺省时的回落值 */
export const MCP_DEFAULT_QPS_LIMIT = 5;
export const MCP_DEFAULT_DAILY_LIMIT = 500;
export const MCP_DEFAULT_IP_MAX_PER_MIN = 60;

/**
 * 后台令牌页视图契约(服务端视图层与客户端岛共用一份)
 *
 * 令牌视图**永不回哈希与明文**(只写不读口径);
 * 最近调用只带工具名/目标 id/成败/耗时,不带请求体全文。
 */
export type McpTokenView = {
  /** 是否已配置活跃令牌(哈希非空) */
  configured: boolean;
  /** 令牌明文前缀(非机密,便于人工识别) */
  tokenPrefix: string;
  scope: McpScopeValue | null;
  expiresAt: string | null;
  issuedAt: string | null;
  adminUserId: string | null;
  qpsLimit: number;
  dailyLimit: number;
  ipMaxPerMin: number;
};

export type McpRecentCall = {
  id: string;
  tool: string;
  ok: boolean;
  targetId: string | null;
  durationMs: number | null;
  createdAt: string;
};

export type McpAdminView = {
  token: McpTokenView;
  /** 今日已调用次数(令牌级日配额计数) */
  todayCalls: number;
  recentCalls: McpRecentCall[];
};
