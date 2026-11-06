import "server-only";
import { prisma } from "@/lib/db";
import { setLockIfAbsent } from "@/lib/redis/rate-limit";
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

/**
 * 去重审计写入(防写放大):同一 dedupKey 在 windowSec 内只落一行。
 * 攻击洪峰下计数照常推进,审计表不被刷屏;返回是否真的写了。
 * Redis 不可用时降级为直接写(宁可多写不可丢事件)。
 */
export async function writeAuditOnce(
  entry: AuditEntry,
  dedupKey: string,
  windowSec: number,
): Promise<boolean> {
  let acquired: boolean;
  try {
    acquired = await setLockIfAbsent(dedupKey, windowSec);
  } catch {
    acquired = true;
  }
  if (!acquired) return false;
  await writeAudit(entry);
  return true;
}
