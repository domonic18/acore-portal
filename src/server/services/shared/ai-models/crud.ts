import "server-only";

import { z } from "zod";

import { prisma } from "@/lib/db";
import type { AiModelAdminView } from "@/lib/ai-models-types";
import {
  AI_MODEL_ROLES,
  AI_PROTOCOLS,
  AI_TIMEOUT_SEC_MAX,
  AI_TIMEOUT_SEC_MIN,
  type AiModelRole,
  type AiProtocol,
} from "@/constants/ai-models";
import { AUDIT_ACTION } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";

/** 端点尾缀白名单:粘贴完整端点自动剥到 base(base_url 存裸端点,SDK 自行拼路径) */
const ENDPOINT_SUFFIXES = ["/chat/completions", "/v1/messages", "/embeddings"] as const;

/**
 * normalizeBaseUrl:trim → 去尾斜杠 → 剥端点尾缀。
 * openai 用户常粘 `.../v1/chat/completions`,anthropic 用户常粘 `.../anthropic/v1/messages`,
 * 智谱 embedding 常粘 `.../v4/embeddings`——统一剥尾缀后落库裸 base。
 */
export function normalizeBaseUrl(raw: string): string {
  let url = raw.trim().replace(/\/+$/, "");
  for (const suffix of ENDPOINT_SUFFIXES) {
    if (url.endsWith(suffix)) {
      url = url.slice(0, -suffix.length);
      break;
    }
  }
  return url.replace(/\/+$/, "");
}

export class AiModelError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** roles Json 安全解析:非法值剔除后仍须至少一项,否则视为库内脏数据抛错 */
export function parseRoles(value: unknown): AiModelRole[] {
  if (!Array.isArray(value)) throw new AiModelError("ROLES_CORRUPTED", "模型用途数据损坏。");
  const roles = value.filter((r): r is AiModelRole =>
    (AI_MODEL_ROLES as readonly string[]).includes(r as string),
  );
  if (roles.length === 0) throw new AiModelError("ROLES_CORRUPTED", "模型用途数据损坏。");
  return roles;
}

const baseFields = {
  name: z.string().trim().min(1).max(100),
  provider: z.string().trim().min(1).max(50),
  protocol: z.enum(AI_PROTOCOLS),
  modelId: z.string().trim().min(1).max(100),
  roles: z.array(z.enum(AI_MODEL_ROLES)).min(1),
  timeoutSec: z.number().int().min(AI_TIMEOUT_SEC_MIN).max(AI_TIMEOUT_SEC_MAX).default(120),
  enabled: z.boolean().default(true),
};

export const aiModelCreateSchema = z.object({
  ...baseFields,
  baseUrl: z.string().trim().max(500).optional().nullable(),
  apiKey: z.string().trim().max(500).optional().nullable(),
});
export type AiModelCreateInput = z.infer<typeof aiModelCreateSchema>;

export const aiModelUpdateSchema = z.object({
  ...baseFields,
  baseUrl: z.string().trim().max(500).optional().nullable(),
  apiKey: z.string().trim().max(500).optional().nullable(),
});
export type AiModelUpdateInput = z.infer<typeof aiModelUpdateSchema>;

function toView(
  row: Awaited<ReturnType<typeof prisma.aiModel.findFirstOrThrow>>,
  bindingRoles: AiModelAdminView["bindingRoles"],
): AiModelAdminView {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    protocol: row.protocol as AiProtocol,
    baseUrl: row.baseUrl,
    modelId: row.modelId,
    roles: parseRoles(row.roles),
    enabled: row.enabled,
    timeoutSec: row.timeoutSec,
    apiKeyConfigured: Boolean(row.apiKey),
    lastTest: row.lastTestedAt
      ? {
          at: row.lastTestedAt.toISOString(),
          status: row.lastTestStatus ?? "",
          error: row.lastTestError,
          latencyMs: row.lastTestLatencyMs,
        }
      : null,
    bindingRoles,
  };
}

async function bindingRolesFor(id: number): Promise<AiModelAdminView["bindingRoles"]> {
  const bindings = await prisma.aiRoleBinding.findMany({
    where: { OR: [{ primaryId: id }, { backupId: id }] },
    select: { role: true, primaryId: true },
  });
  return bindings.map((b) => ({
    role: b.role as AiModelRole,
    position: b.primaryId === id ? ("primary" as const) : ("backup" as const),
  }));
}

export async function listAiModelsAdmin(): Promise<AiModelAdminView[]> {
  const rows = await prisma.aiModel.findMany({ orderBy: { id: "asc" } });
  return Promise.all(
    rows.map(async (row) => toView(row, await bindingRolesFor(row.id))),
  );
}

async function assertNotBoundByDeletedBinding(id: number): Promise<void> {
  const hit = await prisma.aiRoleBinding.count({ where: { OR: [{ primaryId: id }, { backupId: id }] } });
  if (hit > 0) {
    throw new AiModelError("BINDING_REFERENCED", "该模型正被角色绑定引用,请先在角色绑定中解绑。");
  }
}

export async function createAiModel(
  input: AiModelCreateInput,
  operatorId: bigint,
): Promise<AiModelAdminView> {
  const row = await prisma.aiModel.create({
    data: {
      name: input.name,
      provider: input.provider,
      protocol: input.protocol,
      baseUrl: input.baseUrl ? normalizeBaseUrl(input.baseUrl) || null : null,
      modelId: input.modelId,
      apiKey: input.apiKey || null,
      roles: input.roles,
      enabled: input.enabled,
      timeoutSec: input.timeoutSec,
    },
  });
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_MODEL_SAVED,
    actorUserId: operatorId,
    payload: { id: row.id, name: row.name, provider: row.provider, protocol: row.protocol },
  });
  return toView(row, await bindingRolesFor(row.id));
}

export async function updateAiModel(
  id: number,
  input: AiModelUpdateInput,
  operatorId: bigint,
): Promise<AiModelAdminView> {
  const existing = await prisma.aiModel.findUnique({ where: { id } });
  if (!existing) throw new AiModelError("NOT_FOUND", "模型条目不存在。");
  const row = await prisma.aiModel.update({
    where: { id },
    data: {
      name: input.name,
      provider: input.provider,
      protocol: input.protocol,
      baseUrl: input.baseUrl ? normalizeBaseUrl(input.baseUrl) || null : null,
      // apiKey 空串/缺省 = 保留现值(规则 12 secret 口径);明文永不回显故无法被「清空」,
      // 换密钥 = 直接粘新值覆盖
      apiKey: input.apiKey || existing.apiKey,
      modelId: input.modelId,
      roles: input.roles,
      enabled: input.enabled,
      timeoutSec: input.timeoutSec,
    },
  });
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_MODEL_SAVED,
    actorUserId: operatorId,
    payload: { id: row.id, name: row.name, provider: row.provider, protocol: row.protocol },
  });
  return toView(row, await bindingRolesFor(id));
}

export async function setAiModelEnabled(
  id: number,
  enabled: boolean,
  operatorId: bigint,
): Promise<AiModelAdminView> {
  const row = await prisma.aiModel.update({ where: { id }, data: { enabled } });
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_MODEL_STATUS_CHANGED,
    actorUserId: operatorId,
    payload: { id, name: row.name, enabled },
  });
  return toView(row, await bindingRolesFor(id));
}

export async function deleteAiModel(id: number, operatorId: bigint): Promise<void> {
  await assertNotBoundByDeletedBinding(id);
  const row = await prisma.aiModel.delete({ where: { id } });
  await writeAudit({
    category: "admin",
    action: AUDIT_ACTION.AI_MODEL_DELETED,
    actorUserId: operatorId,
    payload: { id, name: row.name, provider: row.provider, protocol: row.protocol },
  });
}

/** 取一条已存条目(探针测试用;含 apiKey 明文,只在服务层内部流转) */
export async function getAiModelStored(id: number) {
  return prisma.aiModel.findUnique({ where: { id } });
}
