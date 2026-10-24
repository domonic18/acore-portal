import { describe, expect, test } from "vitest";
import {
  CART_PARAM_SCHEMAS,
  ITEM_SEND_PARAM_SCHEMA,
} from "@/server/services/shop/param-schemas";
import { itemSendHandler } from "@/server/services/shop/handlers/item-send";
import { itemRestoreHandler } from "@/server/services/shop/handlers/item-restore";
import {
  charChangeFactionHandler,
  charChangeRaceHandler,
  charCustomizeHandler,
  charRenameHandler,
} from "@/server/services/shop/handlers/character-change";
import { nameUnlockHandler } from "@/server/services/shop/handlers/name-unlock";
import { charCloneHandler, charTransferHandler } from "@/server/services/shop/handlers/char-move";
import { guildChangeHandler } from "@/server/services/shop/handlers/guild-change";
import { resolveHandler } from "@/server/services/shop/handlers/registry";

/**
 * T037 处理器单测(FR-122/123,soap-delivery §SKU→处理器→命令映射):
 * resolveHandler 路由(前缀/精确键/未命中)+ 各处理器 validateSchema 参数矩阵
 * (与加购同源,双重把关)+ 名字解锁规范化/公会名合法性等纯校验。
 */

const EXACT_HANDLERS = [
  itemRestoreHandler,
  charChangeRaceHandler,
  charChangeFactionHandler,
  charCustomizeHandler,
  charRenameHandler,
  nameUnlockHandler,
  charTransferHandler,
  charCloneHandler,
  guildChangeHandler,
];

describe("resolveHandler 路由(T037)", () => {
  test("itemsend_ 前缀统一由 ItemSendHandler 承接", () => {
    expect(resolveHandler("itemsend_19061")).toBe(itemSendHandler);
    expect(resolveHandler("itemsend_1")).toBe(itemSendHandler);
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

  test("公会变更:公会名 2-24 位字母/数字/汉字,可含空格与 '-',非法字符拒绝", () => {
    const schema = guildChangeHandler.validateSchema;
    const ok = (v: string) => schema.safeParse({ characterGuid: 10, guildName: v }).success;
    expect(ok("王者归来")).toBe(true);
    expect(ok("Knights")).toBe(true);
    expect(ok("ab")).toBe(true);
    expect(ok("  圣光  ")).toBe(true); // trim 后合法
    expect(ok("圣 骑 士")).toBe(true); // 内部空格
    expect(ok("a")).toBe(false); // 过短
    expect(ok("a".repeat(25))).toBe(false); // 超长
    expect(ok("<script>")).toBe(false); // 注入字符
    expect(ok("   ")).toBe(false); // trim 后为空
  });

  test("转移/复制:destAccount 必填 2-32 位", () => {
    for (const handler of [charTransferHandler, charCloneHandler]) {
      const schema = handler.validateSchema;
      expect(schema.safeParse({ characterGuid: 10, destAccount: "target" }).success, handler.skuKey).toBe(true);
      expect(schema.safeParse({ characterGuid: 10, destAccount: "ab" }).success, handler.skuKey).toBe(true);
      expect(schema.safeParse({ characterGuid: 10, destAccount: "" }).success, handler.skuKey).toBe(false);
      expect(
        schema.safeParse({ characterGuid: 10, destAccount: "a".repeat(33) }).success,
        handler.skuKey,
      ).toBe(false);
      expect(schema.safeParse({ characterGuid: 10 }).success, handler.skuKey).toBe(false);
    }
  });

  test("物品类矩阵:仅收 characterGuid", () => {
    expect(itemSendHandler.validateSchema.safeParse({ characterGuid: 5 }).success).toBe(true);
    expect(itemSendHandler.validateSchema.safeParse({}).success).toBe(false);
    expect(itemSendHandler.validateSchema.safeParse({ characterGuid: 5, qty: 1 }).success).toBe(false);
  });
});
