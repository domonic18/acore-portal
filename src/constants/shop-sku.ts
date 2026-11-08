import {
  ITEM_SKU_STACK_SUFFIX,
  ITEMSEND_SKU_PREFIX,
  TRANSMOG_ITEM_SKU_PREFIX,
  parseItemSendSku,
  parseTransmogSku,
} from "@/constants/shop";

/**
 * 商品 SKU 契约(宪法 I 铁律③,后台商品编辑页共用):
 * 物品类 SKU = itemsend_{物品ID}[_stack] / transmog-item_{物品ID};
 * 服务类 = 发货处理器键(注册表内的 6 个处理器)。
 *
 * 2026-11-08 整改:服务类的「发货处理器键」**独立于 SKU 落列**
 * (product.handler_key,下单时快照到 order_item.handler_key)——
 * SKU 退回纯唯一标识。此前 SKU 既当标识又当处理器键,复制商品只能追加 `-copy`
 * 后缀 ⇒ 副本命中不了处理器注册表 ⇒ **每个副本必然发不出货**
 * (复制功能仅服务类可用,即副本 100% 坏)。物品类不变:SKU 本身即发货依据。
 */

/** 服务类可选的发货处理器(与 shop/handlers/registry.ts 的 exactHandlers 一一对应) */
export const SERVICE_HANDLER_OPTIONS = [
  { key: "item-restoration", label: "物品恢复", hint: "找回已丢失的物品" },
  { key: "char-change-race", label: "角色转种族", hint: "修改角色种族" },
  { key: "char-change-faction", label: "角色转阵营", hint: "修改角色阵营" },
  { key: "char-change-customize", label: "角色自定义外观", hint: "自定义角色外观" },
  { key: "char-change-name", label: "角色改名", hint: "修改角色名字" },
  { key: "name-unlock", label: "解锁名字", hint: "解锁隐藏名字" },
] as const;

export type ServiceHandlerKey = (typeof SERVICE_HANDLER_OPTIONS)[number]["key"];

const SERVICE_HANDLER_KEYS: readonly string[] = SERVICE_HANDLER_OPTIONS.map((o) => o.key);

/** 是否为已注册的服务类发货处理器键 */
export function isServiceHandlerKey(key: string): boolean {
  return SERVICE_HANDLER_KEYS.includes(key);
}

/** 物品类 SKU → 物品 ID(itemsend_ / transmog-item_ 任一前缀);非物品类返回 null */
export function skuItemId(sku: string): number | null {
  return parseItemSendSku(sku)?.itemId ?? parseTransmogSku(sku);
}

/** 物品类 SKU 是否为「一封邮件发多个」形态(itemsend_{id}_stack) */
export function isStackSku(sku: string): boolean {
  return parseItemSendSku(sku)?.isStack === true;
}

/** 由所选物品派生物品类 SKU;stack=true → itemsend_{id}_stack */
export function buildItemSendSku(entry: number, opts?: { stack?: boolean }): string {
  const base = `${ITEMSEND_SKU_PREFIX}${entry}`;
  return opts?.stack ? `${base}${ITEM_SKU_STACK_SUFFIX}` : base;
}

/** 由所选物品派生变形(transmog)类 SKU */
export function buildTransmogSku(entry: number): string {
  return `${TRANSMOG_ITEM_SKU_PREFIX}${entry}`;
}

/**
 * 由表单当前状态派生应写入的 SKU(物品类;服务类返回 null——服务类走处理器下拉)。
 * gameItemId 为空 → null(表示尚未选择物品)。
 * currentSku 用于保留「变形(transmog)」前缀:存量 transmog-item_ 商品重新点选物品时
 * 不得被降级成 itemsend_(两者是不同发货处理器)。
 */
export function deriveSku(input: {
  type: string;
  gameItemId: number | null;
  stack: boolean;
  currentSku?: string;
}): string | null {
  if (input.type !== "game_item") return null;
  if (input.gameItemId == null) return null;
  if (input.currentSku?.startsWith(TRANSMOG_ITEM_SKU_PREFIX)) {
    return buildTransmogSku(input.gameItemId);
  }
  return buildItemSendSku(input.gameItemId, { stack: input.stack });
}

/**
 * 服务类 SKU 派生:新建时取处理器键本身;已有 SKU(副本/自定义)保持原值,
 * 只有「SKU 仍等于换选前的处理器键」时才随新处理器键同步。
 */
export function deriveServiceSku(input: {
  handlerKey: string;
  currentSku: string | null;
  previousHandlerKey?: string | null;
}): string {
  const current = (input.currentSku ?? "").trim();
  if (!current) return input.handlerKey;
  if (input.previousHandlerKey && current === input.previousHandlerKey) return input.handlerKey;
  return current;
}

export type SkuBindingError = {
  code:
    | "SKU_FORMAT_INVALID"
    | "SKU_ITEM_MISMATCH"
    | "SKU_TYPE_MISMATCH"
    | "SKU_HANDLER_UNBOUND"
    | "SKU_GAME_ITEM_REQUIRED"
    | "SKU_STACK_REQUIRED";
  field: "sku" | "gameItemId";
  message: string;
};

/**
 * SKU ↔ 物品 ID / 发货处理器 的交叉校验(纯函数,不查库):
 * 物品类:SKU 必须能解析出物品 ID,且等于所选游戏物品 ID;
 *        可堆叠物品(stackable>1)必须带 _stack 后缀(否则多件会发多封邮件,
 *        而堆叠物品应一封邮件发 qty 个);
 * 服务类:必须绑定已注册的发货处理器键;SKU 只作唯一标识(可为 -copy 派生串)。
 */
export function validateSkuBinding(input: {
  type: string;
  sku: string;
  gameItemId: number | null;
  handlerKey?: string | null;
  /** 所选物品是否可堆叠(world.item_template.stackable>1);null=未知 */
  stackable?: number | null;
}): SkuBindingError | null {
  const sku = input.sku.trim();
  if (input.type === "game_item") {
    if (input.gameItemId == null) {
      return {
        code: "SKU_GAME_ITEM_REQUIRED",
        field: "gameItemId",
        message: "请先选择游戏物品,系统会自动生成对应的 SKU。",
      };
    }
    const itemId = skuItemId(sku);
    if (itemId == null) {
      return {
        code: "SKU_FORMAT_INVALID",
        field: "sku",
        message:
          "SKU 格式不对:物品类应为 itemsend_{物品ID} 或 transmog-item_{物品ID}。请重新点选一次游戏物品以自动修正 SKU。",
      };
    }
    if (itemId !== input.gameItemId) {
      return {
        code: "SKU_ITEM_MISMATCH",
        field: "sku",
        message: `SKU 指向物品 #${itemId},与所选物品 #${input.gameItemId} 不一致。请重新点选一次游戏物品以自动修正 SKU,或在高级区手动改写。`,
      };
    }
    if ((input.stackable ?? 1) > 1 && !isStackSku(sku)) {
      return {
        code: "SKU_STACK_REQUIRED",
        field: "sku",
        message:
          "该物品可堆叠,SKU 需带 _stack 后缀(itemsend_{物品ID}_stack),才能一封邮件发多个。",
      };
    }
    return null;
  }

  if (!sku) {
    return {
      code: "SKU_FORMAT_INVALID",
      field: "sku",
      message: "服务类商品必须填写 SKU(商品唯一标识)。",
    };
  }
  if (sku.startsWith(ITEMSEND_SKU_PREFIX) || sku.startsWith(TRANSMOG_ITEM_SKU_PREFIX)) {
    return {
      code: "SKU_TYPE_MISMATCH",
      field: "sku",
      message: "服务类商品不能使用物品类 SKU(itemsend_ / transmog-item_)。",
    };
  }
  const handlerKey = (input.handlerKey ?? "").trim();
  if (!handlerKey) {
    return {
      code: "SKU_HANDLER_UNBOUND",
      field: "sku",
      message: "服务类商品必须选择发货处理器,请从下拉列表中选择。",
    };
  }
  if (!isServiceHandlerKey(handlerKey)) {
    return {
      code: "SKU_HANDLER_UNBOUND",
      field: "sku",
      message: `发货处理器「${handlerKey}」未注册,请从下拉列表中选择。`,
    };
  }
  return null;
}
