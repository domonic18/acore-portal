/**
 * AI 模型注册表契约类型(服务端产出 / 后台客户端共用,boundary 双向可达——
 * 同 status-types 口径)。apiKey 明文永不进任何视图,只回 apiKeyConfigured 布尔。
 */
import type { AiModelRole, AiProtocol } from "@/constants/ai-models";

/** 后台模型条目脱敏视图(永不回 apiKey 明文;定位由角色绑定派生) */
export type AiModelAdminView = {
  id: number;
  name: string;
  provider: string;
  protocol: AiProtocol;
  baseUrl: string | null;
  modelId: string;
  roles: AiModelRole[];
  enabled: boolean;
  timeoutSec: number;
  apiKeyConfigured: boolean;
  lastTest: {
    at: string;
    status: string;
    error: string | null;
    latencyMs: number | null;
  } | null;
  bindingRoles: { role: AiModelRole; position: "primary" | "backup" }[];
};

/** 角色绑定视图(一行一角色) */
export type RoleBindingView = {
  role: AiModelRole;
  primaryId: number | null;
  backupId: number | null;
  dailyMax: number;
};

/** 探针结果(候选值/已存条目两路共用) */
export type AiModelProbeResult = {
  ok: boolean;
  /** 成功=一句话结论;失败=脱敏后的原因摘要 */
  message: string;
  latencyMs: number;
};
