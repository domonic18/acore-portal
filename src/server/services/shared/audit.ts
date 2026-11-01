import "server-only";
import { prisma } from "@/lib/db";
import type { AuditCategoryValue } from "@/constants/audit";

export type AuditEntry = {
  category: AuditCategoryValue;
  action: string;
  actorUserId?: bigint | null;
  payload?: Record<string, unknown>;
  ip?: string | null;
};

/**
 * 审计写入(宪法 VI):调用方保证 payload 脱敏——
 * 禁止携带密码/令牌/明文敏感值,只记事件与必要标识
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      category: entry.category,
      action: entry.action,
      actorUserId: entry.actorUserId ?? null,
      payloadJson: (entry.payload ?? {}) as object,
      ip: entry.ip ?? null,
    },
  });
}
