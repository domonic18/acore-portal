import { describe, expect, it } from "vitest";
import { buildDeliveryFailureCard } from "@/server/services/shop/delivery-alert";

/**
 * 发货失败告警卡片(2026-11-08):一屏看完「谁、买了什么、为什么失败」。
 */
describe("发货失败告警卡片", () => {
  it("含订单/用户/商品/时间四栏与失败原因", () => {
    const card = buildDeliveryFailureCard({
      orderId: "123",
      username: "someone",
      items: [{ name: "角色改名", sku: "char-change-name-copy" }],
      error: "DELIVERY_NO_HANDLER",
    });
    expect(card.title).toBe("商城发货失败");
    expect(card.template).toBe("red");
    expect(card.fields?.map((f) => f.label)).toEqual(["订单号", "用户", "商品", "时间"]);
    expect(card.fields?.find((f) => f.label === "订单号")?.value).toBe("123");
    expect(card.fields?.find((f) => f.label === "商品")?.value).toContain("char-change-name-copy");
    expect(card.body).toContain("DELIVERY_NO_HANDLER");
  });

  it("无失败行时商品栏给出占位,不报错", () => {
    const card = buildDeliveryFailureCard({
      orderId: "1",
      username: "u",
      items: [],
      error: "",
    });
    expect(card.fields?.find((f) => f.label === "商品")?.value).toBe("(无)");
    expect(card.body).toContain("(未记录)");
  });
});
