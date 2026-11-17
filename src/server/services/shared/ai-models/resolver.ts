import "server-only";

import { prisma } from "@/lib/db";
import { AI_CHAT_DAILY_MAX_DEFAULT, type AiModelRole, type AiProtocol } from "@/constants/ai-models";

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

/** chat 绑定的日配额(0=不限额);绑定行缺失时代码回落默认值 */
export async function getChatDailyMax(): Promise<number> {
  const binding = await prisma.aiRoleBinding.findUnique({ where: { role: "chat" } });
  if (!binding) return AI_CHAT_DAILY_MAX_DEFAULT;
  return binding.dailyMax;
}

/** 条目是否承担某角色(校验/展示共用;roles Json 安全解析) */
export function modelHasRole(roles: unknown, role: AiModelRole): boolean {
  try {
    return parseRoles(roles).includes(role);
  } catch {
    return false;
  }
}
