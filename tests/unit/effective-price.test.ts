import { describe, expect, it } from "vitest";
import { effectivePrice } from "@/server/services/catalog/products";

/**
 * T017 单测(FR-115):促销档期生效价由服务端 now() 判定,
 * 纯函数时间注入(now 作参数);开始/结束瞬间闭区间。
 */
const BASE = {
  price: 300,
  salePrice: 200,
  saleStart: new Date("2026-01-10T00:00:00Z"),
  saleEnd: new Date("2026-01-20T00:00:00Z"),
};

describe("effectivePrice(FR-115)", () => {
  it("无促销配置 → 原价", () => {
    expect(effectivePrice({ price: 300 }, new Date("2026-01-15T00:00:00Z"))).toBe(300);
    expect(
      effectivePrice({ price: 300, salePrice: null }, new Date("2026-01-15T00:00:00Z")),
    ).toBe(300);
  });

  it("档期内 → 促销价", () => {
    expect(effectivePrice(BASE, new Date("2026-01-15T00:00:00Z"))).toBe(200);
  });

  it("开始与结束瞬间边界(闭区间) → 促销价", () => {
    expect(effectivePrice(BASE, new Date("2026-01-10T00:00:00Z"))).toBe(200);
    expect(effectivePrice(BASE, new Date("2026-01-20T00:00:00Z"))).toBe(200);
  });

  it("开始前/结束后 → 恢复原价", () => {
    expect(effectivePrice(BASE, new Date("2026-01-09T23:59:59Z"))).toBe(300);
    expect(effectivePrice(BASE, new Date("2026-01-20T00:00:01Z"))).toBe(300);
  });

  it("单端开放(null 端不限)", () => {
    // 仅设结束档期:开始前任意时刻均为促销价
    expect(
      effectivePrice(
        { price: 100, salePrice: 50, saleStart: null, saleEnd: new Date("2030-01-01T00:00:00Z") },
        new Date("2026-01-01T00:00:00Z"),
      ),
    ).toBe(50);
    // 仅设开始档期:结束后仍为促销价
    expect(
      effectivePrice(
        { price: 100, salePrice: 50, saleStart: new Date("2026-01-01T00:00:00Z"), saleEnd: null },
        new Date("2030-01-01T00:00:00Z"),
      ),
    ).toBe(50);
  });
});
