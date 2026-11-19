/**
 * 商品运营 MCP 常量(二期 M6;规格 §17):
 *
 * MCP 是后台商品能力的对外投影——工具只暴露白名单内的动作,
 * 写入一律走 services/catalog 的同一入口,不因调用方是 AI 而放松校验。
 *
 * 令牌口径:MiniMax 式长期令牌——默认已有一枚、掩码显示、随时复制、随时轮换、
 * **无有效期**;明文落 system_config(与 SMTP/COS 密钥同库同权限,仅管理员会话可读),
 * 轮换即覆盖旧令牌。
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
  /** 论坛运营(巡检灌水/申诉客服;写入走 services/forum 同一入口,下架=可逆软删) */
  LIST_FORUM_THREADS: "list_forum_threads",
  GET_FORUM_THREAD: "get_forum_thread",
  REPLY_FORUM_THREAD: "reply_forum_thread",
  UPDATE_FORUM_THREAD_TITLE: "update_forum_thread_title",
  DELETE_FORUM_THREAD: "delete_forum_thread",
} as const;

export type McpToolName = (typeof MCP_TOOL)[keyof typeof MCP_TOOL];

/** system_config 的 mcp 组键名(令牌状态 + 限额) */
export const MCP_CONFIG_KEYS = {
  /** 令牌明文(MiniMax 式:掩码显示、随时复制;与 SMTP/COS 密钥同库同权限) */
  token: "mcp.token",
  /** 作用域:read | write */
  tokenScope: "mcp.tokenScope",
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

/** 令牌明文前缀:便于人工识别 */
export const MCP_TOKEN_PLAIN_PREFIX = "lokta_mcp_";

/** 掩码展示:前 12 位 + 掩码 + 后 4 位(中段不外泄) */
export function maskMcpToken(plain: string): string {
  if (!plain) return "";
  const mask = "•".repeat(8);
  return plain.length <= 16
    ? `${plain.slice(0, 4)}${mask}`
    : `${plain.slice(0, 12)}${mask}${plain.slice(-4)}`;
}

/** 默认限额:配置键缺省时的回落值 */
export const MCP_DEFAULT_QPS_LIMIT = 5;
export const MCP_DEFAULT_DAILY_LIMIT = 500;
export const MCP_DEFAULT_IP_MAX_PER_MIN = 60;

/**
 * 后台令牌页视图契约(服务端视图层与客户端岛共用一份)
 *
 * 令牌视图只回**掩码**串与元信息(明文仅在「复制令牌」时按管理员会话单独取回);
 * 最近调用只带工具名/目标 id/成败/耗时,不带请求体全文。
 */
export type McpTokenView = {
  /** 是否已配置活跃令牌 */
  configured: boolean;
  /** 掩码令牌(前 12 位 + 掩码 + 后 4 位) */
  maskedToken: string;
  scope: McpScopeValue | null;
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
  /** MCP 服务地址(由站点 URL 派生) */
  endpoint: string;
};
