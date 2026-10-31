import { beforeEach, describe, expect, it, vi } from "vitest";

const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));

vi.mock("@/lib/db", () => ({
  prisma: { pointRule: { findUnique } },
}));

import {
  getPointRule,
  getEarnAmount,
  assertEarnEvent,
} from "@/server/services/points/rules";

/**
 * T010 单测(FR-104/research R10):获取类积分经 point_rule 表驱动;
 * 消费(shop_payment)与手调(manual_adjust)为固定账务路径不经规则表。
 */

describe("point_rule 表驱动规则引擎", () => {
  beforeEach(() => {
    findUnique.mockReset();
  });

  it("读取规则:enabled 规则返回分值(改 amount 后新奖励=新值)", async () => {
    findUnique.mockResolvedValue({ event: "register", amount: 7, enabled: true });
    await expect(getEarnAmount("register")).resolves.toBe(7);
    expect(findUnique).toHaveBeenCalledWith({ where: { event: "register" } });
  });

  it("enabled=false 规则 → 加分为 0(不发分)", async () => {
    findUnique.mockResolvedValue({ event: "badge_grant", amount: 10, enabled: false });
    await expect(getEarnAmount("badge_grant")).resolves.toBe(0);
  });

  it("规则缺失 → 加分为 0(不抛错,获取类事件缺省不发分)", async () => {
    findUnique.mockResolvedValue(null);
    await expect(getEarnAmount("register")).resolves.toBe(0);
  });

  it("getPointRule 返回原始行供调用方判断开关", async () => {
    findUnique.mockResolvedValue({ event: "register", amount: 2, enabled: true });
    await expect(getPointRule("register")).resolves.toEqual({
      event: "register",
      amount: 2,
      enabled: true,
    });
  });

  it("消费/手调等非获取类事件被拒绝经规则表(固定账务路径,FR-104)", () => {
    expect(() => assertEarnEvent("shop_payment")).toThrow();
    expect(() => assertEarnEvent("manual_adjust")).toThrow();
    expect(() => assertEarnEvent("register")).not.toThrow();
    expect(() => assertEarnEvent("badge_grant")).not.toThrow();
  });
});
