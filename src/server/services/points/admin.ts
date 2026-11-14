import "server-only";
import { prisma } from "@/lib/db";
import {
  POINT_RULE_AMOUNT_MAX,
  POINT_RULE_EVENT_LABEL,
  POINT_RULE_EVENTS,
  type PointRuleEventValue,
} from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";

/**
 * 后台积分规则管理(FR-104):获取类事件的分值与开关由 point_rule 表驱动,
 * 后台改完即刻对新发生的发放生效(已入账的流水不追溯)。
 *
 * 规则行可能缺行(历史环境只由 dev seed 灌,生产库曾为空)⇒ 保存走 upsert 补种。
 * 固定账务路径(shop_payment / manual_adjust)不经此表,不在本页管控范围。
 */

export type PointRuleDto = {
  event: PointRuleEventValue;
  label: string;
  amount: number;
  enabled: boolean;
  remark: string | null;
  /** 规则行是否已存在于库(缺行 = 从未配置,保存即补种) */
  configured: boolean;
};

export type PointRuleChange = {
  event: PointRuleEventValue;
  amount: number;
  enabled: boolean;
};

export type SavePointRulesOutcome =
  | { ok: true; changed: PointRuleEventValue[] }
  | { ok: false; reason: "invalid_event" | "invalid_amount" };

/** 列出全部受管规则事件(缺行的事件也列出,便于后台补种) */
export async function listPointRules(): Promise<PointRuleDto[]> {
  const rows = await prisma.pointRule.findMany({
    where: { event: { in: [...POINT_RULE_EVENTS] } },
    select: { event: true, amount: true, enabled: true, remark: true },
  });
  const byEvent = new Map(rows.map((r) => [r.event, r]));
  return POINT_RULE_EVENTS.map((event) => {
    const row = byEvent.get(event);
    return {
      event,
      label: POINT_RULE_EVENT_LABEL[event],
      amount: row?.amount ?? 0,
      enabled: row?.enabled ?? false,
      remark: row?.remark ?? null,
      configured: row !== undefined,
    };
  });
}

/**
 * 保存规则变更(分值 + 开关):同事务逐条 upsert,仅对实际变化的规则落审计
 * (payload 含前后值,宪法 VI 记事件不记敏感值)。
 */
export async function savePointRules(input: {
  changes: PointRuleChange[];
  operatorId: bigint;
  ip?: string | null;
}): Promise<SavePointRulesOutcome> {
  const known = new Set<string>(POINT_RULE_EVENTS);
  for (const change of input.changes) {
    if (!known.has(change.event)) return { ok: false, reason: "invalid_event" };
    if (
      !Number.isInteger(change.amount) ||
      change.amount < 0 ||
      change.amount > POINT_RULE_AMOUNT_MAX
    ) {
      return { ok: false, reason: "invalid_amount" };
    }
  }

  const changed: PointRuleEventValue[] = [];
  await prisma.$transaction(async (tx) => {
    for (const change of input.changes) {
      const before = await tx.pointRule.findUnique({
        where: { event: change.event },
        select: { amount: true, enabled: true },
      });
      if (before && before.amount === change.amount && before.enabled === change.enabled) {
        continue;
      }
      await tx.pointRule.upsert({
        where: { event: change.event },
        create: {
          event: change.event,
          amount: change.amount,
          enabled: change.enabled,
          remark: `后台积分规则:${POINT_RULE_EVENT_LABEL[change.event]}`,
        },
        update: { amount: change.amount, enabled: change.enabled },
      });
      changed.push(change.event);
      await writeAudit(
        {
          category: AUDIT_CATEGORY.POINTS,
          action: AUDIT_ACTION.POINT_RULE_SAVED,
          actorUserId: input.operatorId,
          payload: {
            event: change.event,
            before: before ? { amount: before.amount, enabled: before.enabled } : null,
            after: { amount: change.amount, enabled: change.enabled },
          },
          ip: input.ip,
        },
        tx,
      );
    }
  });
  return { ok: true, changed };
}
