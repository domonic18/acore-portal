import "server-only";

import { prisma } from "@/lib/db";
import { AI_SITE_DAILY_TOKEN_MAX_DEFAULT, type AiModelRole, type AiProtocol } from "@/constants/ai-models";

import { parseRoles } from "./crud";

/**
 * 解析后的可调用模型(调用方拿到的就是构造 client 所需的全部字段);
 * source 表明当前生效的是主力还是备用(备用生效 = 降级状态,调用方可提示)。
 */
export type ResolvedAiModel = {
  id: number;
  name: string;
  protocol: AiProtocol;
  baseUrl: string | null;
  modelId: string;
  apiKey: string | null;
  timeoutSec: number;
  source: "primary" | "backup";
};

/**
 * 选边纯函数:**按 enabled 静态选边**(主力启用用主力,否则备用启用用备用),
 * 不做运行时失败重试/故障切换——与 aitech-hub 同口径。
 */
export function pickBoundModel(
  primary: { enabled: boolean } & Record<string, unknown> | null,
  backup: { enabled: boolean } & Record<string, unknown> | null,
): "primary" | "backup" | null {
  if (primary?.enabled) return "primary";
  if (backup?.enabled) return "backup";
  return null;
}

/** 绑定行里的模型条目(取解析所需的最小字段集) */
type BoundModelRow = {
  id: number;
  name: string;
  protocol: string;
  baseUrl: string | null;
  modelId: string;
  apiKey: string | null;
  timeoutSec: number;
  enabled: boolean;
};

/** 把绑定行(含主备条目)解析成生效条目;未绑定/全停用 → null */
function pickResolvedModel(binding: {
  primary: BoundModelRow | null;
  backup: BoundModelRow | null;
}): ResolvedAiModel | null {
  const pick = pickBoundModel(binding.primary, binding.backup);
  if (!pick) return null;
  const row = pick === "primary" ? binding.primary! : binding.backup!;
  return {
    id: row.id,
    name: row.name,
    protocol: row.protocol as AiProtocol,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    apiKey: row.apiKey,
    timeoutSec: row.timeoutSec,
    source: pick,
  };
}

/**
 * 每请求直查库,不做进程内缓存:6K 用户规模单表主键查询足够(YAGNI),
 * 后台改绑定/停用条目即时生效,无失效问题。
 */
export async function resolveAiModel(role: AiModelRole): Promise<ResolvedAiModel | null> {
  const binding = await prisma.aiRoleBinding.findUnique({
    where: { role },
    include: { primary: true, backup: true },
  });
  if (!binding) return null;
  return pickResolvedModel(binding);
}

/**
 * 对话角色的一次性解析:生效模型 + 站点日 Token 上限,**一次查库**。
 * 上限与模型同在 ai_role_binding 行上,分两次查会出现「同一请求读到不同绑定行」
 * 的窗口(后台改绑定时),故合成一次解析。
 */
export async function resolveChatBinding(): Promise<{
  model: ResolvedAiModel | null;
  /** 站点日 Token 上限(0=不限额);绑定行缺失时回落默认值 */
  dailyTokenMax: number;
}> {
  const binding = await prisma.aiRoleBinding.findUnique({
    where: { role: "chat" },
    include: { primary: true, backup: true },
  });
  if (!binding) {
    return { model: null, dailyTokenMax: AI_SITE_DAILY_TOKEN_MAX_DEFAULT };
  }
  return {
    model: pickResolvedModel(binding),
    dailyTokenMax: binding.dailyTokenMax,
  };
}

/** 条目是否承担某角色(校验/展示共用;roles Json 安全解析) */
export function modelHasRole(roles: unknown, role: AiModelRole): boolean {
  try {
    return parseRoles(roles).includes(role);
  } catch {
    return false;
  }
}
