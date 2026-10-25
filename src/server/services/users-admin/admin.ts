import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { POINT_RULE_EVENT, POINT_TX_TYPE } from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { creditLedgerDetailed, LedgerError } from "@/server/services/points/ledger";
import { getEarnAmount } from "@/server/services/points/rules";

/**
 * 后台用户/徽章/邀请码管理(api-admin 契约,FR-130/FR-104):
 * 用户模糊搜索分页;徽章授予 badge_reward 流水 amount 读 point_rule(event=badge_grant,
 * 0/停用跳过入账),重复授予 DUPLICATE(unique badgeId+userId);邀请码批量生成
 * (count 1-200,复用 M1 表与状态机,expired 不落库实时推导)。
 */

export class UsersAdminError extends Error {
  constructor(
    public code: "DUPLICATE" | "NOT_FOUND" | "BADGE_NOT_FOUND" | "PARAM_INVALID",
    message?: string,
  ) {
    super(message ?? `users_admin_error: ${code}`);
    this.name = "UsersAdminError";
  }
}

export const ADMIN_USER_PAGE_SIZE = 20;

export async function listAdminUsers(opts: {
  query?: string;
  page?: number;
}): Promise<{
  users: {
    id: string;
    username: string;
    nickname: string | null;
    email: string;
    role: string;
    status: string;
    balance: number | null;
    createdAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const q = opts.query?.trim();
  const where: Prisma.UserWhereInput = q
    ? {
        OR: [
          { username: { contains: q } },
          { email: { contains: q } },
          { nickname: { contains: q } },
        ],
      }
    : {};
  const total = await prisma.user.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_USER_PAGE_SIZE));
  const rows = await prisma.user.findMany({
    where,
    orderBy: { id: "desc" },
    skip: (page - 1) * ADMIN_USER_PAGE_SIZE,
    take: ADMIN_USER_PAGE_SIZE,
    select: {
      id: true,
      username: true,
      nickname: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      pointAccount: { select: { balance: true } },
    },
  });
  return {
    page,
    totalPages,
    total,
    users: rows.map((u) => ({
      id: u.id.toString(),
      username: u.username,
      nickname: u.nickname,
      email: u.email,
      role: u.role,
      status: u.status,
      balance: u.pointAccount?.balance ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

export async function getAdminUserDetail(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      pointAccount: { select: { balance: true } },
      badgeGrantsReceived: { include: { badge: true, pointTransaction: true } },
    },
  });
  if (!user) return null;
  const transactions = await prisma.pointTransaction.findMany({
    where: { userId: id },
    orderBy: { id: "desc" },
    take: 10,
  });
  return { ...user, recentTransactions: transactions };
}

// ===== 徽章 =====

export async function listBadges() {
  const rows = await prisma.badge.findMany({
    orderBy: { level: "asc" },
    include: { _count: { select: { grants: true } } },
  });
  return rows.map((b) => ({
    id: b.id.toString(),
    name: b.name,
    level: b.level,
    description: b.description,
    grantCount: b._count.grants,
  }));
}

export async function saveBadge(input: {
  id?: bigint;
  name: string;
  level: number;
  description?: string | null;
}): Promise<{ id: bigint }> {
  if (input.id) {
    const hit = await prisma.badge.updateMany({
      where: { id: input.id },
      data: {
        name: input.name,
        level: input.level,
        description: input.description ?? null,
      },
    });
    if (hit.count === 0) throw new UsersAdminError("NOT_FOUND", "徽章不存在。");
    return { id: input.id };
  }
  try {
    const created = await prisma.badge.create({
      data: { name: input.name, level: input.level, description: input.description ?? null },
      select: { id: true },
    });
    return { id: created.id };
  } catch (err) {
    if (isUnique(err)) throw new UsersAdminError("DUPLICATE", "徽章名已存在。");
    throw err;
  }
}

export type GrantBadgeOutcome =
  | { ok: true; grantId: bigint; amount: number }
  | { ok: false; reason: "duplicate" | "badge_not_found" | "user_not_found" };

/** 授予:unique 幂等闸+badge_reward 流水(amount=point_rule badge_grant,0 跳过入账)+审计 */
export async function grantBadge(input: {
  userId: bigint;
  badgeId: bigint;
  operatorId: bigint;
  ip?: string | null;
}): Promise<GrantBadgeOutcome> {
  const [user, badge] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.userId }, select: { id: true } }),
    prisma.badge.findUnique({ where: { id: input.badgeId }, select: { id: true, name: true } }),
  ]);
  if (!user) return { ok: false, reason: "user_not_found" };
  if (!badge) return { ok: false, reason: "badge_not_found" };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const grant = await tx.badgeGrant.create({
        data: { badgeId: badge.id, userId: user.id, grantedBy: input.operatorId },
        select: { id: true },
      });
      let amount = 0;
      let pointTransactionId: bigint | null = null;
      const before =
        (
          await tx.pointAccount.findUnique({
            where: { userId: user.id },
            select: { balance: true },
          })
        )?.balance ?? 0;
      const reward = await getEarnAmount(POINT_RULE_EVENT.BADGE_GRANT);
      if (reward > 0) {
        amount = reward;
        const credited = await creditLedgerDetailed(tx, {
          userId: user.id,
          amount: reward,
          type: POINT_TX_TYPE.BADGE_REWARD,
          remark: `徽章授予:${badge.name}`,
          refType: "badge_grant",
          refId: badge.id,
        });
        pointTransactionId = credited.transactionId;
        await tx.badgeGrant.update({
          where: { id: grant.id },
          data: { pointTransactionId },
        });
      }
      await writeAudit({
        category: AUDIT_CATEGORY.ADMIN,
        action: AUDIT_ACTION.BADGE_GRANT,
        actorUserId: input.operatorId,
        payload: {
          userId: user.id.toString(),
          badgeId: badge.id.toString(),
          badgeName: badge.name,
          grantId: grant.id.toString(),
          rewardAmount: amount,
          balanceBefore: before,
        },
        ip: input.ip,
      });
      return { grantId: grant.id, amount };
    });
    return { ok: true, ...result };
  } catch (err) {
    if (isUnique(err)) return { ok: false, reason: "duplicate" };
    if (err instanceof LedgerError) throw err;
    throw err;
  }
}

function isUnique(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";
}

// ===== 邀请码(M1 表与状态机复用) =====

const INVITATION_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const INVITATION_COUNT_MAX = 200;

export type InvitationListItem = {
  id: string;
  code: string;
  status: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  expired: boolean;
  usedBy: string[];
  createdAt: string;
};

export const ADMIN_INVITATION_PAGE_SIZE = 20;

export async function listInvitationCodes(opts: { page?: number }): Promise<{
  items: InvitationListItem[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const total = await prisma.invitationCode.count();
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_INVITATION_PAGE_SIZE));
  const rows = await prisma.invitationCode.findMany({
    orderBy: { id: "desc" },
    skip: (page - 1) * ADMIN_INVITATION_PAGE_SIZE,
    take: ADMIN_INVITATION_PAGE_SIZE,
    include: { uses: { include: { user: { select: { username: true } } } } },
  });
  const now = Date.now();
  return {
    page,
    totalPages,
    total,
    items: rows.map((c) => ({
      id: c.id.toString(),
      code: c.code,
      status: c.status,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      expired: c.expiresAt !== null && c.expiresAt.getTime() < now,
      usedBy: c.uses.map((u) => u.user.username),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function generateInvitationCodes(input: {
  prefix: string;
  length: number;
  count: number;
  maxUses: number;
  expiresAt?: Date | null;
  operatorId: bigint;
  ip?: string | null;
}): Promise<string[]> {
  if (input.count < 1 || input.count > INVITATION_COUNT_MAX) {
    throw new UsersAdminError("PARAM_INVALID", `单次生成数量须在 1-${INVITATION_COUNT_MAX} 之间。`);
  }
  const bodyLen = input.length - input.prefix.length - 1;
  if (bodyLen < 4) {
    throw new UsersAdminError("PARAM_INVALID", "长度不足以容纳随机段(前缀+1+≥4)。");
  }

  const codes: string[] = [];
  for (let i = 0; i < input.count; i += 1) {
    let body = "";
    for (let j = 0; j < bodyLen; j += 1) {
      body += INVITATION_CODE_CHARS[randomInt(INVITATION_CODE_CHARS.length)];
    }
    codes.push(`${input.prefix}-${body}`);
  }
  await prisma.invitationCode.createMany({
    data: codes.map((code) => ({
      code,
      prefix: input.prefix,
      length: input.length,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.operatorId,
    })),
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.INVITATION_GENERATED,
    actorUserId: input.operatorId,
    payload: { count: input.count, prefix: input.prefix, length: input.length, maxUses: input.maxUses },
    ip: input.ip,
  });
  return codes;
}

export async function setInvitationCodeStatus(
  id: bigint,
  status: "available" | "disabled",
  operatorId: bigint,
  ip?: string | null,
): Promise<void> {
  const hit = await prisma.invitationCode.updateMany({ where: { id }, data: { status } });
  if (hit.count === 0) throw new UsersAdminError("NOT_FOUND", "邀请码不存在。");
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.INVITATION_DISABLED,
    actorUserId: operatorId,
    payload: { invitationCodeId: id.toString(), status },
    ip,
  });
}
