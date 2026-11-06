import "server-only";
import { prisma } from "@/lib/db";
import type { AuditCategoryValue } from "@/constants/audit";

/**
 * 本模块只许依赖 prisma——它可达启动钩子链
 * (instrumentation.ts → services/shop/delivery.ts → shared/audit.ts),
 * 而 Next 14 会为 instrumentation 额外编译一份 edge 产物,
 * 任何 node-only 依赖(ioredis/mysql2/node:*)都会让 edge 编译失败。
 * 需要 Redis 的去重写入见 shared/audit-dedup.ts。
 */

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
