import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POINT_TX_TYPE } from "@/constants/points";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import {
  creditLedger,
  debitLedger,
  LedgerError,
  recalculateLedger,
} from "@/server/services/points/ledger";
import { adjustPoints } from "@/server/services/points/adjust";
import { reconcileAllPoints } from "@/server/services/points/reconcile";

/**
 * T011 集成测试(US1 账本;宪法 III 流水为真相源):
 * 6 类流水 balanceAfter 逐步快照 + SUM=balance 不变式;
 * debit 条件扣减不足→LedgerError 且零写入;
 * 手调 reason/amount 校验+审计含前后余额(FR-105);
 * 对账只报告不修复(FR-106):篡改/孤儿流水点名,修复后连跑两次空差异。
 */
const RUN = Date.now().toString(36);
const usernames: string[] = [];

async function makeUser(tag: string) {
  const username = `t_${RUN}_pt_${tag}`.slice(0, 32);
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash: `pttest$${username}`,
      passwordAlgo: "bcrypt_wp",
    },
    select: { id: true, username: true },
  });
  usernames.push(username);
  return user;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
});

afterAll(async () => {
  for (const username of usernames) {
    const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!u) continue;
    await prisma.pointTransaction.deleteMany({ where: { userId: u.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  await prisma.$disconnect();
});

describe("US1 账本核心(T011)", () => {
  it("6 类流水入账:balanceAfter 逐步快照,SUM=balance 不变式", async () => {
    const user = await makeUser("flow");
    const credit = (type: string, amount: number, remark?: string) =>
      prisma.$transaction((tx) =>
        creditLedger(tx, { userId: user.id, amount, type: type as never, remark }),
      );

    await credit(POINT_TX_TYPE.REGISTER_REWARD, 2, "注册奖励");
    await credit(POINT_TX_TYPE.BADGE_REWARD, 10, "徽章");
    await credit(POINT_TX_TYPE.RECURRING, 5, "每周在线");
    await credit(POINT_TX_TYPE.VISITOR_REFERRAL, 3, "推荐");
    const afterDebit = await prisma.$transaction((tx) =>
      debitLedger(tx, {
        userId: user.id,
        amount: 8,
        type: POINT_TX_TYPE.SHOP_PAYMENT,
        remark: "订单 M2 测试",
      }),
    );
    expect(afterDebit).toBe(12);

    const txs = await prisma.pointTransaction.findMany({
      where: { userId: user.id },
      orderBy: { id: "asc" },
    });
    expect(txs.map((t) => [t.type, t.amount, t.balanceAfter])).toEqual([
      ["register_reward", 2, 2],
      ["badge_reward", 10, 12],
      ["recurring", 5, 17],
      ["visitor_referral", 3, 20],
      ["shop_payment", -8, 12],
    ]);

    const account = await prisma.pointAccount.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(account.balance).toBe(12);
    const recalc = await recalculateLedger(user.id);
    expect(recalc.sum).toBe(12);
    expect(recalc.balance).toBe(12);
  });

  it("debit 不足 → LedgerError(INSUFFICIENT_BALANCE),无流水无变动", async () => {
    const user = await makeUser("poor");
    await prisma.$transaction((tx) =>
      creditLedger(tx, {
        userId: user.id,
        amount: 30,
        type: POINT_TX_TYPE.VISITOR_REFERRAL,
      }),
    );

    const err = await prisma
      .$transaction((tx) =>
        debitLedger(tx, { userId: user.id, amount: 31, type: POINT_TX_TYPE.SHOP_PAYMENT }),
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LedgerError);
    expect((err as LedgerError).code).toBe("INSUFFICIENT_BALANCE");

    expect(
      await prisma.pointTransaction.count({
        where: { userId: user.id, type: POINT_TX_TYPE.SHOP_PAYMENT },
      }),
    ).toBe(0);
    const account = await prisma.pointAccount.findUniqueOrThrow({
      where: { userId: user.id },
    });
    expect(account.balance).toBe(30);
  });

  it("adjustPoints:成功入账+审计含前后余额;原因/零额/不足被拒且零写入(FR-105)", async () => {
    const user = await makeUser("adj");
    const operator = await makeUser("op");

    const ok = await adjustPoints({
      userId: user.id,
      amount: 50,
      reason: "活动补偿",
      operatorId: operator.id,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.balanceAfter).toBe(50);

    const tx = await prisma.pointTransaction.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(tx.type).toBe(POINT_TX_TYPE.MANUAL_ADJUST);
    expect(tx.amount).toBe(50);
    expect(tx.refType).toBe("admin");
    expect(tx.refId).toBe(operator.id);
    expect(tx.remark).toBe("活动补偿");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTION.POINTS_ADJUST, actorUserId: operator.id },
      orderBy: { id: "desc" },
    });
    expect(audit.category).toBe(AUDIT_CATEGORY.POINTS);
    const payload = audit.payloadJson as { userId?: string; before?: number; after?: number };
    expect(payload.before).toBe(0);
    expect(payload.after).toBe(50);

    // 校验拒绝:原因缺失/过短/过长、amount=0、扣成负余额
    expect(
      await adjustPoints({ userId: user.id, amount: 1, reason: "短", operatorId: operator.id }),
    ).toEqual({ ok: false, reason: "reason_invalid" });
    expect(
      await adjustPoints({ userId: user.id, amount: 1, reason: "", operatorId: operator.id }),
    ).toEqual({ ok: false, reason: "reason_invalid" });
    expect(
      await adjustPoints({
        userId: user.id,
        amount: 1,
        reason: "长".repeat(256),
        operatorId: operator.id,
      }),
    ).toEqual({ ok: false, reason: "reason_invalid" });
    expect(
      await adjustPoints({ userId: user.id, amount: 0, reason: "零额调整", operatorId: operator.id }),
    ).toEqual({ ok: false, reason: "amount_invalid" });
    expect(
      await adjustPoints({ userId: user.id, amount: -10000, reason: "扣光", operatorId: operator.id }),
    ).toEqual({ ok: false, reason: "insufficient_balance" });

    // 拒绝路径零写入
    expect(await prisma.pointTransaction.count({ where: { userId: user.id } })).toBe(1);
    const account = await prisma.pointAccount.findUniqueOrThrow({ where: { userId: user.id } });
    expect(account.balance).toBe(50);
  });

  it("reconcileAllPoints:篡改/孤儿流水点名,修复后连跑两次空差异(FR-106)", async () => {
    const user = await makeUser("rec");
    await prisma.$transaction((tx) =>
      creditLedger(tx, {
        userId: user.id,
        amount: 100,
        type: POINT_TX_TYPE.VISITOR_REFERRAL,
      }),
    );
    const diffsFor = async () => {
      const r = await reconcileAllPoints();
      return r.diffs.filter((d) => d.userId === user.id);
    };
    expect(await diffsFor()).toEqual([]);

    // 直接改余额模拟漂移 → 点名(stored=107, computed=100),不自动修复
    await prisma.$executeRaw`UPDATE point_account SET balance = balance + 7 WHERE user_id = ${user.id}`;
    expect(await diffsFor()).toEqual([{ userId: user.id, stored: 107, computed: 100 }]);

    await recalculateLedger(user.id);
    expect(await diffsFor()).toEqual([]);

    // 删 account 行模拟孤儿流水 → 同样点名(stored 视为 0)
    await prisma.pointAccount.deleteMany({ where: { userId: user.id } });
    expect(await diffsFor()).toEqual([{ userId: user.id, stored: 0, computed: 100 }]);

    await recalculateLedger(user.id);
    expect(await diffsFor()).toEqual([]);
    expect(await diffsFor()).toEqual([]);
  });
});
