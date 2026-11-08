import { describe, expect, it } from "vitest";
import {
  SERVICE_SKU_OPTIONS,
  buildItemSendSku,
  buildTransmogSku,
  deriveSku,
  isStackSku,
  parseServiceSku,
  skuItemId,
  validateSkuBinding,
} from "@/constants/shop-sku";
import { EXACT_HANDLER_KEYS } from "@/server/services/shop/handlers/registry";
import { slugify, validateProductForm } from "@/components/admin/product-form/validation";
import type { ProductFormValues } from "@/components/admin/product-form/use-product-form";

/**
 * 商品 SKU 契约单测(2026-11-08 商品编辑台重构):
 * 发货按 SKU 解析物品 ID(product.gameItemId 只是元数据),故「SKU ↔ 物品」必须一致,
 * 不一致必须被拦住而不是静默发错物品。
 */
describe("SKU 契约:派生与解析", () => {
  it("物品类派生 itemsend_{entry};堆叠形态为 _stack 后缀", () => {
    expect(deriveSku({ type: "game_item", gameItemId: 19019, stack: false })).toBe("itemsend_19019");
    expect(deriveSku({ type: "game_item", gameItemId: 19019, stack: true })).toBe(
      "itemsend_19019_stack",
    );
    expect(buildItemSendSku(42)).toBe("itemsend_42");
    expect(buildTransmogSku(42)).toBe("transmog-item_42");
    expect(isStackSku("itemsend_42_stack")).toBe(true);
    expect(isStackSku("itemsend_42")).toBe(false);
  });

  it("服务类不派生 SKU;未选物品返回 null", () => {
    expect(deriveSku({ type: "service", gameItemId: 19019, stack: false })).toBeNull();
    expect(deriveSku({ type: "game_item", gameItemId: null, stack: false })).toBeNull();
  });

  it("skuItemId 只认正整数后缀;transmog 形态同样可解析", () => {
    expect(skuItemId("itemsend_19019")).toBe(19019);
    expect(skuItemId("itemsend_19019_stack")).toBe(19019);
    expect(skuItemId("transmog-item_19019")).toBe(19019);
    expect(skuItemId("itemsend_abc")).toBeNull();
    expect(skuItemId("itemsend_0")).toBeNull();
    expect(skuItemId("char-change-name")).toBeNull();
  });
});

describe("SKU 契约:服务处理器键", () => {
  it("下拉选项与发货处理器注册表的精确键集合一致", () => {
    expect(SERVICE_SKU_OPTIONS.map((o) => o.key).sort()).toEqual([...EXACT_HANDLER_KEYS].sort());
  });

  it("注册表键与 -copy 派生键均可解析;未知键为 null", () => {
    for (const key of EXACT_HANDLER_KEYS) {
      expect(parseServiceSku(key)).toEqual({ handlerKey: key, copySuffix: "" });
    }
    expect(parseServiceSku("char-change-name-copy")).toEqual({
      handlerKey: "char-change-name",
      copySuffix: "-copy",
    });
    expect(parseServiceSku("char-change-name-copy-2")).toEqual({
      handlerKey: "char-change-name",
      copySuffix: "-copy-2",
    });
    // 副本的副本(存量复制链)同样可解析
    expect(parseServiceSku("char-change-name-copy-2-copy")?.handlerKey).toBe("char-change-name");
    expect(parseServiceSku("no-such-handler")).toBeNull();
    expect(parseServiceSku("itemsend_19019")).toBeNull();
  });
});

describe("SKU 契约:交叉校验", () => {
  it("物品类:SKU 指向的物品须等于所选物品", () => {
    expect(
      validateSkuBinding({ type: "game_item", sku: "itemsend_19019", gameItemId: 19019 }),
    ).toBeNull();
    const mismatch = validateSkuBinding({
      type: "game_item",
      sku: "itemsend_19019",
      gameItemId: 19020,
    });
    expect(mismatch?.code).toBe("SKU_ITEM_MISMATCH");
    expect(mismatch?.field).toBe("sku");
  });

  it("物品类:格式非法与未选物品分别落到 sku / gameItemId", () => {
    expect(
      validateSkuBinding({ type: "game_item", sku: "itemsend_abc", gameItemId: 19019 })?.code,
    ).toBe("SKU_FORMAT_INVALID");
    const missing = validateSkuBinding({
      type: "game_item",
      sku: "",
      gameItemId: null,
    });
    expect(missing?.code).toBe("SKU_GAME_ITEM_REQUIRED");
    expect(missing?.field).toBe("gameItemId");
  });

  it("服务类:物品类前缀拒绝;未绑处理器拒绝;注册表键放行", () => {
    expect(
      validateSkuBinding({ type: "service", sku: "itemsend_19019", gameItemId: null })?.code,
    ).toBe("SKU_TYPE_MISMATCH");
    expect(
      validateSkuBinding({ type: "service", sku: "char-change-name", gameItemId: null }),
    ).toBeNull();
    expect(
      validateSkuBinding({ type: "service", sku: "no-such-handler", gameItemId: null })?.code,
    ).toBe("SKU_HANDLER_UNBOUND");
  });
});

describe("表单字段校验", () => {
  const base: ProductFormValues = {
    type: "game_item",
    sku: "itemsend_19019",
    name: "测试商品",
    slug: "test-item",
    description: "",
    images: [],
    detailMd: "",
    categoryId: "1",
    price: 100,
    stockEnabled: false,
    gameItemId: 19019,
    status: "draft",
    listed: true,
    featured: false,
  };

  it("合法值无错误", () => {
    expect(validateProductForm(base)).toEqual({});
  });

  it("促销价须低于原价;促销窗口不可倒置", () => {
    expect(validateProductForm({ ...base, salePrice: 100 }).salePrice).toBe("促销价必须低于原价");
    expect(validateProductForm({ ...base, salePrice: 150 }).salePrice).toBe("促销价必须低于原价");
    expect(
      validateProductForm({
        ...base,
        saleStart: "2026-12-01T00:00",
        saleEnd: "2026-11-01T00:00",
      }).saleEnd,
    ).toBe("促销结束须晚于促销开始");
  });

  it("名称/slug/分类必填;slug 仅小写字母数字与连字符", () => {
    expect(validateProductForm({ ...base, name: "  " }).name).toBeTruthy();
    expect(validateProductForm({ ...base, slug: "" }).slug).toBeTruthy();
    expect(validateProductForm({ ...base, slug: "Bad Slug" }).slug).toBeTruthy();
    expect(validateProductForm({ ...base, categoryId: "" }).categoryId).toBeTruthy();
  });

  it("图片上限 20 张;每人限购至少 1 件", () => {
    expect(
      validateProductForm({ ...base, images: Array.from({ length: 21 }, (_, i) => `/a${i}.png`) })
        .images,
    ).toBeTruthy();
    expect(validateProductForm({ ...base, maxPerUser: 0 }).maxPerUser).toBeTruthy();
  });

  it("slugify:中文名产出空串(须手填),英文名产出合法 slug", () => {
    expect(slugify("测试坐骑")).toBe("");
    expect(slugify("Rare Mount 19019")).toBe("rare-mount-19019");
  });
});
