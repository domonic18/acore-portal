import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
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

export type AuditQuery = {
  category?: AuditCategoryValue;
  action?: string;
  actorUserId?: bigint | null;
  ip?: string | null;
  since?: Date;
  until?: Date;
  /** 游标:上一页最后一条的 id(id 倒序翻页,避免 OFFSET 深翻页扫描) */
  cursor?: bigint | null;
  /** 单页条数(1~200,默认 50) */
  limit?: number;
};

/** 审计行的对外视图模型(BigInt → 字符串,Date → ISO 串,不透传 Prisma 对象) */
export type AuditEntryDto = {
  id: string;
  category: AuditCategoryValue;
  action: string;
  actorUserId: string | null;
  ip: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
};

const AUDIT_QUERY_MAX_LIMIT = 200;

/**
 * 审计读取(2026-11-06 撞库加固 PR-J):
 * 此前 audit_log 只写不读——撞库既无法界定受害账号,也无法复盘。
 *
 * 游标翻页(id 倒序):id 是自增主键,倒序即时间倒序,游标比较走主键索引,
 * 不像 OFFSET 那样越翻越慢。nextCursor 为 null 即末页。
 */
export async function queryAuditLog(
  q: AuditQuery,
): Promise<{ items: AuditEntryDto[]; nextCursor: bigint | null }> {
  const limit = Math.min(
    AUDIT_QUERY_MAX_LIMIT,
    Math.max(1, Math.floor(q.limit ?? 50)),
  );
  const where: Prisma.AuditLogWhereInput = {};
  if (q.category) where.category = q.category;
  if (q.action) where.action = q.action;
  if (q.actorUserId !== undefined) where.actorUserId = q.actorUserId;
  if (q.ip !== undefined) where.ip = q.ip;
  if (q.since || q.until) {
    where.createdAt = {
      ...(q.since ? { gte: q.since } : {}),
      ...(q.until ? { lte: q.until } : {}),
    };
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { id: "desc" },
    take: limit + 1,
    ...(q.cursor != null ? { cursor: { id: q.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  return {
    items: page.map((r) => ({
      id: r.id.toString(),
      category: r.category,
      action: r.action,
      actorUserId: r.actorUserId?.toString() ?? null,
      ip: r.ip,
      payload: (r.payloadJson ?? {}) as Record<string, unknown>,
      createdAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore && last ? last.id : null,
  };
}
