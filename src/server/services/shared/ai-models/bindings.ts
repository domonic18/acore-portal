import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";
import type { RoleBindingView } from "@/lib/ai-models-types";
import {
  AI_MODEL_ROLES,
  AI_SITE_DAILY_TOKEN_MAX_DEFAULT,
  AI_SITE_DAILY_TOKEN_MAX_LIMIT,
  type AiModelRole,
} from "@/constants/ai-models";
import { AUDIT_ACTION } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";

export class AiRoleBindingError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const roleBindingUpdateSchema = z.object({
  role: z.enum(AI_MODEL_ROLES),
  primaryId: z.number().int().positive().nullable(),
  backupId: z.number().int().positive().nullable(),
  dailyTokenMax: z
    .number()
    .int()
    .min(0)
    .max(AI_SITE_DAILY_TOKEN_MAX_LIMIT)
    .default(AI_SITE_DAILY_TOKEN_MAX_DEFAULT),
});
export type RoleBindingUpdateInput = z.infer<typeof roleBindingUpdateSchema>;

type BindingRow = {
  role: string;
  primaryId: number | null;
  backupId: number | null;
  dailyTokenMax: number;
};

/**
 * 绑定选型校验纯函数(保存前后共用语义):
 * ① 引用的模型存在 ② enabled ③ roles 含该角色 ④ embedding 只能绑 openai 协议
 * ⑤ 主力≠备用 ⑥ 至少绑一个位置。
 */
export function validateBindingSelection(
  input: { role: AiModelRole; primaryId: number | null; backupId: number | null },
  models: { id: number; enabled: boolean; roles: unknown; protocol: string }[],
): { ok: true } | { ok: false; code: string; message: string } {
  if (input.primaryId === null && input.backupId === null) {
    return { ok: true }; // 双空 = 解绑该角色(合法:该角色功能关闭)
  }
  if (input.primaryId !== null && input.primaryId === input.backupId) {
    return { ok: false, code: "SAME_MODEL", message: "主力与备用不能是同一个模型条目。" };
  }
  for (const [position, id] of [
    ["primary", input.primaryId],
    ["backup", input.backupId],
  ] as const) {
    if (id === null) continue;
    const model = models.find((m) => m.id === id);
    if (!model) {
      return { ok: false, code: "MODEL_NOT_FOUND", message: "绑定的模型条目不存在。" };
    }
    if (!model.enabled) {
      return { ok: false, code: "MODEL_DISABLED", message: `绑定的${position === "primary" ? "主力" : "备用"}模型已停用,请先启用。` };
    }
    if (!Array.isArray(model.roles) || !model.roles.includes(input.role)) {
      return { ok: false, code: "ROLE_MISMATCH", message: "绑定的模型不承担该用途,请先在条目上勾选对应用途。" };
    }
    if (input.role === "embedding" && model.protocol !== "openai") {
      return { ok: false, code: "PROTOCOL_MISMATCH", message: "向量角色只支持 openai 兼容协议(anthropic 无 embedding 端点)。" };
    }
  }
  return { ok: true };
}

async function ensureBindingRows(): Promise<void> {
  await prisma.aiRoleBinding.createMany({
    data: AI_MODEL_ROLES.map((role) => ({
      role,
      dailyTokenMax: AI_SITE_DAILY_TOKEN_MAX_DEFAULT,
    })),
    skipDuplicates: true,
  });
}

/** 绑定列表(缺行自动播种 chat/embedding 两行,保证后台页永远拿到两卡) */
export async function listRoleBindings(): Promise<RoleBindingView[]> {
  await ensureBindingRows();
  const rows = await prisma.aiRoleBinding.findMany({ orderBy: { role: "asc" } });
  return rows.map((row: BindingRow) => ({
    role: row.role as AiModelRole,
    primaryId: row.primaryId,
    backupId: row.backupId,
    dailyTokenMax: row.dailyTokenMax,
  }));
}

export async function updateRoleBinding(
  input: RoleBindingUpdateInput,
  operatorId: bigint,
): Promise<RoleBindingView> {
  const ids = [input.primaryId, input.backupId].filter((v): v is number => v !== null);
  const models = await prisma.aiModel.findMany({
    where: { id: { in: ids } },
    select: { id: true, enabled: true, roles: true, protocol: true },
  });
  const verdict = validateBindingSelection(input, models);
  if (!verdict.ok) throw new AiRoleBindingError(verdict.code, verdict.message);

  await ensureBindingRows();
  const row = await prisma.aiRoleBinding.update({
    where: { role: input.role },
    data: {
      primaryId: input.primaryId,
      backupId: input.backupId,
      dailyTokenMax: input.dailyTokenMax,
    },
  });
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_ROLE_BINDING_CHANGED,
    actorUserId: operatorId,
    payload: {
      role: input.role,
      primaryId: input.primaryId,
      backupId: input.backupId,
      dailyTokenMax: input.dailyTokenMax,
    },
  });
  return {
    role: row.role as AiModelRole,
    primaryId: row.primaryId,
    backupId: row.backupId,
    dailyTokenMax: row.dailyTokenMax,
  };
}
