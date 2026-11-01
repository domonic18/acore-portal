import "server-only";
import { prisma } from "@/lib/db";
import { POINT_RULE_EVENT, POINT_TX_TYPE } from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { creditLedgerDetailed, LedgerError } from "@/server/services/shared/ledger";
import { getEarnAmount } from "@/server/services/points/rules";
import { isUnique, UsersAdminError } from "./shared";

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
