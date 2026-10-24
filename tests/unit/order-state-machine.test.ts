import { describe, expect, test } from "vitest";
import { ORDER_STATUS, type OrderStatusValue } from "@/constants/shop";
import {
  assertTransition,
  isTerminal,
  statusTimestampField,
  TRANSITIONS,
} from "@/server/services/shop/state-machine";

/**
 * T027 状态机单测(FR-116,data-model §3):合法迁移表全覆盖+非法迁移抛错。
 * 迁移落库的并发守卫(状态条件 UPDATE)在 delivery/checkout 集成层验证。
 */

const S = ORDER_STATUS;

const LEGAL: [OrderStatusValue, OrderStatusValue[]][] = [
  [S.PENDING, [S.PAID]],
  [S.PAID, [S.DELIVERING, S.CANCELLED, S.REFUNDED]],
  [S.DELIVERING, [S.COMPLETED, S.DELIVERY_FAILED]],
  [S.DELIVERY_FAILED, [S.DELIVERING, S.REFUNDED]],
  [S.COMPLETED, []],
  [S.CANCELLED, []],
  [S.REFUNDED, []],
];

describe("订单状态机(T027)", () => {
  test("迁移表与合法迁移全集一致", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      Object.values(S).sort(),
    );
    for (const [from, tos] of LEGAL) {
      expect([...TRANSITIONS[from]].sort()).toEqual([...tos].sort());
    }
  });

  test("合法迁移逐条通过(assertTransition 不抛)", () => {
    for (const [from, tos] of LEGAL) {
      for (const to of tos) {
        expect(() => assertTransition(from, to)).not.toThrow();
      }
    }
  });

  test("非法迁移全部抛错(含跨级/倒退/终态出发/自迁移)", () => {
    const illegal: [OrderStatusValue, OrderStatusValue][] = [
      [S.PENDING, S.DELIVERING],
      [S.PENDING, S.COMPLETED],
      [S.PENDING, S.CANCELLED],
      [S.PENDING, S.REFUNDED],
      [S.PAID, S.COMPLETED],
      [S.PAID, S.PENDING],
      [S.DELIVERING, S.PAID],
      [S.DELIVERING, S.CANCELLED],
      [S.DELIVERING, S.DELIVERING],
      [S.DELIVERY_FAILED, S.COMPLETED],
      [S.DELIVERY_FAILED, S.PAID],
      [S.COMPLETED, S.DELIVERING],
      [S.COMPLETED, S.REFUNDED],
      [S.CANCELLED, S.PAID],
      [S.REFUNDED, S.DELIVERING],
      [S.PAID, S.PAID],
    ];
    for (const [from, to] of illegal) {
      expect(() => assertTransition(from, to)).toThrow(/状态迁移|Illegal/);
    }
  });

  test("状态时间戳映射:paid/delivering/completed/cancelled/refunded 各有归处,delivery_failed 无专字段", () => {
    expect(statusTimestampField(S.PAID)).toBe("paidAt");
    expect(statusTimestampField(S.DELIVERING)).toBe("deliveringAt");
    expect(statusTimestampField(S.COMPLETED)).toBe("completedAt");
    expect(statusTimestampField(S.CANCELLED)).toBe("cancelledAt");
    expect(statusTimestampField(S.REFUNDED)).toBe("refundedAt");
    expect(statusTimestampField(S.DELIVERY_FAILED)).toBeNull();
  });

  test("终态判定:completed/cancelled/refunded 为终态,其余非终态", () => {
    expect(isTerminal(S.COMPLETED)).toBe(true);
    expect(isTerminal(S.CANCELLED)).toBe(true);
    expect(isTerminal(S.REFUNDED)).toBe(true);
    expect(isTerminal(S.PENDING)).toBe(false);
    expect(isTerminal(S.PAID)).toBe(false);
    expect(isTerminal(S.DELIVERING)).toBe(false);
    expect(isTerminal(S.DELIVERY_FAILED)).toBe(false);
  });
});
