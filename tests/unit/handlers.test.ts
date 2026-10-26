import { describe, expect, test } from "vitest";
import {
  CART_PARAM_SCHEMAS,
  ITEM_SEND_PARAM_SCHEMA,
} from "@/server/services/shop/param-schemas";
import { parseItemSendSku, parseTransmogSku } from "@/constants/shop";
import { itemSendHandler } from "@/server/services/shop/handlers/item-send";
import { transmogItemHandler } from "@/server/services/shop/handlers/transmog-item";
import { itemRestoreHandler } from "@/server/services/shop/handlers/item-restore";
import {
  charChangeFactionHandler,
  charChangeRaceHandler,
  charCustomizeHandler,
  charRenameHandler,
} from "@/server/services/shop/handlers/character-change";
import { nameUnlockHandler } from "@/server/services/shop/handlers/name-unlock";
import { resolveHandler } from "@/server/services/shop/handlers/registry";

/**
 * T037 处理器单测(FR-122/123,soap-delivery §SKU→处理器→命令映射):
 * resolveHandler 路由(前缀/精确键/未命中)+ 各处理器 validateSchema 参数矩阵
 * (与加购同源,双重把关)+ 名字解锁规范化等纯校验。
 * 商品面对齐 WP 旧站:转移/复制/公会类服务不提供,无对应处理器。
 */

const EXACT_HANDLERS = [
  itemRestoreHandler,
  charChangeRaceHandler,
  charChangeFactionHandler,
  charCustomizeHandler,
  charRenameHandler,
  nameUnlockHandler,
];

describe("resolveHandler 路由(T037)", () => {
  test("itemsend_ 前缀统一由 ItemSendHandler 承接", () => {
    expect(resolveHandler("itemsend_19061")).toBe(itemSendHandler);
    expect(resolveHandler("itemsend_1")).toBe(itemSendHandler);
    expect(resolveHandler("itemsend_90001_stack")).toBe(itemSendHandler);
  });

  test("transmog-item_ 前缀统一由 TransmogItemHandler 承接", () => {
    expect(resolveHandler("transmog-item_12584")).toBe(transmogItemHandler);
    expect(transmogItemHandler.validateSchema).toBe(ITEM_SEND_PARAM_SCHEMA);
    expect(CART_PARAM_SCHEMAS["transmog-item_12584"]).toBeUndefined();
  });

  test("服务类 SKU 精确命中各自处理器,skuKey 与矩阵键一致", () => {
    for (const handler of EXACT_HANDLERS) {
      expect(resolveHandler(handler.skuKey), handler.skuKey).toBe(handler);
      expect(CART_PARAM_SCHEMAS[handler.skuKey], handler.skuKey).toBeDefined();
    }
  });

  test("未注册 SKU 返回 null(发货层防御拒绝入口)", () => {
    expect(resolveHandler("unknown-service")).toBeNull();
    expect(resolveHandler("itemsend")).toBeNull();
  });

  test("全部处理器都声明 validateSchema 且与参数矩阵同源(引用相等)", () => {
    expect(itemSendHandler.validateSchema).toBe(ITEM_SEND_PARAM_SCHEMA);
    for (const handler of EXACT_HANDLERS) {
      expect(handler.validateSchema, handler.skuKey).toBe(
        CART_PARAM_SCHEMAS[handler.skuKey],
      );
    }
  });
});

describe("validateSchema 参数矩阵(T037)", () => {
  test("角色类四处理器:仅收 characterGuid,多余字段拒绝(strict)", () => {
    for (const handler of [
      charChangeRaceHandler,
      charChangeFactionHandler,
      charCustomizeHandler,
      charRenameHandler,
    ]) {
      const ok = handler.validateSchema.safeParse({ characterGuid: 10 });
      expect(ok.success, handler.skuKey).toBe(true);
      const missing = handler.validateSchema.safeParse({});
      expect(missing.success, handler.skuKey).toBe(false);
      const extra = handler.validateSchema.safeParse({ characterGuid: 10, unlockName: "X" });
      expect(extra.success, handler.skuKey).toBe(false);
    }
  });

  test("装备恢复:restoreItemEntry 必选且为正整数", () => {
    const schema = itemRestoreHandler.validateSchema;
    expect(schema.safeParse({ characterGuid: 10, restoreItemEntry: 19019 }).success).toBe(true);
    expect(schema.safeParse({ characterGuid: 10 }).success).toBe(false);
    expect(schema.safeParse({ characterGuid: 10, restoreItemEntry: 0 }).success).toBe(false);
    expect(schema.safeParse({ characterGuid: 10, restoreItemEntry: 1.5 }).success).toBe(false);
  });

  test("名字解锁:首字母大写规范化(小写/大写/混合输入同归一),格式非法拒绝", () => {
    const schema = nameUnlockHandler.validateSchema;
    const parse = (v: string) => {
      const r = schema.safeParse({ characterGuid: 10, unlockName: v });
      return r.success ? (r.data as { unlockName: string }).unlockName : null;
    };
    expect(parse("newname")).toBe("Newname");
    expect(parse("NEWNAME")).toBe("Newname");
    expect(parse("wArLoRd1")).toBe("Warlord1");
    expect(parse("  thunder  ")).toBe("Thunder");
    expect(parse("1abc")).toBeNull(); // 数字开头
    expect(parse("a")).toBeNull(); // 过短
    expect(parse("abc def")).toBeNull(); // 含空格
    expect(parse("名字名")).toBeNull(); // 非字母
    expect(parse("abcdefghijkl")).not.toBeNull(); // 恰 12 位合法
    expect(parse("abcdefghijklm")).toBeNull(); // 超 12 位
  });

  test("未提供类 SKU(转移/复制/公会)返回 null,矩阵无行", () => {
    expect(resolveHandler("char-transfer")).toBeNull();
    expect(resolveHandler("char-clone")).toBeNull();
    expect(resolveHandler("guild-change")).toBeNull();
    expect(CART_PARAM_SCHEMAS["char-transfer"]).toBeUndefined();
    expect(CART_PARAM_SCHEMAS["char-clone"]).toBeUndefined();
    expect(CART_PARAM_SCHEMAS["guild-change"]).toBeUndefined();
  });

  test("parseItemSendSku/parseTransmogSku:物品 id 与 _stack 形态解析", () => {
    expect(parseItemSendSku("itemsend_44092")).toEqual({ itemId: 44092, isStack: false });
    expect(parseItemSendSku("itemsend_90001_stack")).toEqual({ itemId: 90001, isStack: true });
    expect(parseItemSendSku("itemsend_90001_stackx")).toBeNull();
    expect(parseItemSendSku("itemsend_stack")).toBeNull();
    expect(parseItemSendSku("itemsend_0")).toBeNull();
    expect(parseItemSendSku("itemsend_-1")).toBeNull();
    expect(parseItemSendSku("itemsend_1.5")).toBeNull();
    expect(parseItemSendSku("transmog-item_12584")).toBeNull();
    expect(parseTransmogSku("transmog-item_12584")).toBe(12584);
    expect(parseTransmogSku("transmog-item_abc")).toBeNull();
    expect(parseTransmogSku("itemsend_12584")).toBeNull();
  });

  test("物品类矩阵:仅收 characterGuid", () => {
    expect(itemSendHandler.validateSchema.safeParse({ characterGuid: 5 }).success).toBe(true);
    expect(itemSendHandler.validateSchema.safeParse({}).success).toBe(false);
    expect(itemSendHandler.validateSchema.safeParse({ characterGuid: 5, qty: 1 }).success).toBe(false);
  });
});
