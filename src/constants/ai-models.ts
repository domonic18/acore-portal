// AI 模型注册表(LLM 通道重构,照 aitech-hub 形态):协议/角色枚举 + 供应商预设。
// 条目落 ai_model 表、生效关系落 ai_role_binding 表;本文件只放枚举与前端预填常量。
// 预设端点核实日期 2026-11-17(官方文档);预设只做前端预填,落库为自由串可改。

export const AI_PROTOCOLS = ["openai", "anthropic"] as const;
export type AiProtocol = (typeof AI_PROTOCOLS)[number];

export const AI_PROTOCOL_LABELS: Record<AiProtocol, string> = {
  openai: "openai 兼容",
  anthropic: "anthropic 原生",
} as const;

export const AI_MODEL_ROLES = ["chat", "embedding"] as const;
export type AiModelRole = (typeof AI_MODEL_ROLES)[number];

export const AI_MODEL_ROLE_LABELS: Record<AiModelRole, string> = {
  chat: "对话模型",
  embedding: "向量模型",
} as const;

/** 角色说明(后台绑定卡副文案) */
export const AI_MODEL_ROLE_HINTS: Record<AiModelRole, string> = {
  chat: "驱动 /search 问答页与右下角助手抽屉",
  embedding: "驱动语义检索(/search 语义通道)",
} as const;

/** anthropic 协议无 embedding 端点:embedding 角色只能绑 openai 协议条目 */
export const AI_ROLE_PROTOCOL_CONSTRAINT: Record<AiModelRole, readonly AiProtocol[]> = {
  chat: AI_PROTOCOLS,
  embedding: ["openai"],
} as const;

export interface AiProviderPreset {
  name: string;
  /** openai 协议建议 Base URL */
  baseUrl: string;
  /** anthropic 协议建议 Base URL(null = 该供应商无 anthropic 端点) */
  anthropicBaseUrl: string | null;
  /** 建议 modelId 示例(仅 placeholder 提示) */
  exampleModelId: string;
}

/**
 * 供应商预设(前端下拉 + 选即预填协议与 Base URL,均可改)。
 * 坑位备注(预设下方提示用户):
 * - MiniMax:国内/国际账号与 Key 体系独立,混用 401
 * - 小米 MiMo:sk-(按量)与 tp-(Token Plan)Key 端点不可混用
 * - 智谱:base_url 不再多拼 /v1
 */
export const AI_PROVIDER_PRESETS: readonly AiProviderPreset[] = [
  {
    name: "MiniMax(国内版)",
    baseUrl: "https://api.minimaxi.com/v1",
    anthropicBaseUrl: "https://api.minimaxi.com/anthropic",
    exampleModelId: "MiniMax-Text-01",
  },
  {
    name: "小米 MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    anthropicBaseUrl: "https://api.xiaomimimo.com/anthropic",
    exampleModelId: "MiMo-VL-7B-RL",
  },
  {
    name: "智谱 AI",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    anthropicBaseUrl: null,
    exampleModelId: "embedding-3",
  },
];

/** 角色绑定日配额默认值(行缺失时的代码回落,与迁移 DDL DEFAULT 一致) */
export const AI_CHAT_DAILY_MAX_DEFAULT = 20;

/** 超时秒上下限(后台表单与服务端校验同口径) */
export const AI_TIMEOUT_SEC_MIN = 10;
export const AI_TIMEOUT_SEC_MAX = 600;
