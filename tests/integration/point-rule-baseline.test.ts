import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

/**
 * 积分规则基线(迁移补种):
 * point_rule 的 register/badge_grant 基线行原只由 scripts/dev/seed.ts 灌,
 * 生产/测试库不跑 dev seed ⇒ 规则表为空 ⇒ getEarnAmount 返回 0 ⇒ 新注册不发分
 * (线上已复现)。补种迁移后,任何环境都须有这两条基线行。
 */
const BASELINE_EVENTS = ["register", "badge_grant"] as const;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("point_rule 基线行", () => {
  it("register/badge_grant 两条基线存在且启用", async () => {
    const rows = await prisma.pointRule.findMany({
      where: { event: { in: [...BASELINE_EVENTS] } },
      select: { event: true, amount: true, enabled: true },
    });
    expect(rows.map((r) => r.event).sort()).toEqual([...BASELINE_EVENTS].sort());
    for (const row of rows) expect(row.enabled).toBe(true);
  });

  it("register 规则有分值(缺行/停用都会让新注册不发分)", async () => {
    const rule = await prisma.pointRule.findUniqueOrThrow({
      where: { event: "register" },
      select: { amount: true, enabled: true },
    });
    expect(rule.enabled).toBe(true);
    expect(rule.amount).toBeGreaterThanOrEqual(1);
  });
});
