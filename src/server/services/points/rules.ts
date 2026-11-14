import "server-only";
import { prisma } from "@/lib/db";
import { POINT_RULE_EVENT, type PointRuleEventValue } from "@/constants/points";

/**
 * 积分规则引擎(FR-104/research R10):仅获取类事件经 point_rule 表驱动;
 * 消费(shop_payment)与手调(manual_adjust)为固定账务路径不经此表(assertEarnEvent 守门)。
 *
 * 规则行由迁移补种基线(register=2 / badge_grant=0),当前**没有管理端界面**——
 * 改分值需改库或补迁移。此前该表只由 dev seed 灌,生产库为空 ⇒ 新注册不发分(线上已复现)。
 */

export async function getPointRule(event: PointRuleEventValue) {
  return prisma.pointRule.findUnique({ where: { event } });
}

/** enabled=false 或规则缺失 → 0(缺省不发分,不抛错) */
export async function getEarnAmount(event: PointRuleEventValue): Promise<number> {
  const rule = await getPointRule(event);
  if (!rule || !rule.enabled) return 0;
  return rule.amount;
}

/** 非获取类事件拒绝进规则路径(固定账务路径:shop_payment/manual_adjust 等) */
export function assertEarnEvent(event: string): asserts event is PointRuleEventValue {
  if (!Object.values(POINT_RULE_EVENT).includes(event as PointRuleEventValue)) {
    throw new Error(`非获取类事件不经规则表: ${event}`);
  }
}
