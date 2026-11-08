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
 * 服务类 SKU = 发货处理器注册表里的精确键。
 *
 * 关键约束:**发货处理器从 SKU 解析物品 ID**(item-send/transmog-item),
 * 商品上的 gameItemId 只是元数据、不参与发货——两者不一致会静默发错物品,
 * 故保存时必须交叉校验(见 validateSkuBinding 与 catalog/admin/products.ts)。
 */

/** 服务类商品可选的处理器键(与 shop/handlers/registry.ts 的 exactHandlers 一一对应) */
export const SERVICE_SKU_OPTIONS = [
  { key: "item-restoration", label: "物品恢复", hint: "找回已丢失的物品" },
  { key: "char-change-race", label: "角色转种族", hint: "修改角色种族" },
  { key: "char-change-faction", label: "角色转阵营", hint: "修改角色阵营" },
  { key: "char-change-customize", label: "角色自定义外观", hint: "自定义角色外观" },
  { key: "char-change-name", label: "角色改名", hint: "修改角色名字" },
  { key: "name-unlock", label: "解锁名字", hint: "解锁隐藏名字" },
] as const;

export type ServiceSkuKey = (typeof SERVICE_SKU_OPTIONS)[number]["key"];

const SERVICE_SKU_KEYS: readonly string[] = SERVICE_SKU_OPTIONS.map((o) => o.key);

/** 服务类副本 SKU 后缀(批量复制生成:<键>-copy / <键>-copy-N) */
const SERVICE_COPY_SUFFIX = /^(.*?)(-copy(?:-\d+)?)$/;

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
 * 解析服务类 SKU:命中注册表键返回 { handlerKey, copySuffix };
 * 副本(<键>-copy / <键>-copy-N,乃至副本的副本)也放行(存量副本须可编辑,发货缺陷另议)。
 */
export function parseServiceSku(sku: string): { handlerKey: string; copySuffix: string } | null {
  if (SERVICE_SKU_KEYS.includes(sku)) return { handlerKey: sku, copySuffix: "" };
  let rest = sku;
  const suffixes: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    const m = SERVICE_COPY_SUFFIX.exec(rest);
    if (!m || !m[1]) break;
    suffixes.unshift(m[2] ?? "");
    rest = m[1];
  }
  if (suffixes.length > 0 && SERVICE_SKU_KEYS.includes(rest)) {
    return { handlerKey: rest, copySuffix: suffixes.join("") };
  }
  return null;
}

/**
 * 由表单当前状态派生应写入的 SKU(物品类;服务类返回 null——服务类 SKU 来自处理器下拉)。
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

export type SkuBindingError = {
  code:
    | "SKU_FORMAT_INVALID"
    | "SKU_ITEM_MISMATCH"
    | "SKU_TYPE_MISMATCH"
    | "SKU_HANDLER_UNBOUND"
    | "SKU_GAME_ITEM_REQUIRED";
  field: "sku" | "gameItemId";
  message: string;
};

/**
 * SKU ↔ 物品 ID / 处理器注册表 的交叉校验(纯函数,不查库):
 * 物品类:SKU 必须能解析出物品 ID,且等于所选游戏物品 ID;
 * 服务类:SKU 必须是注册表键(允许 -copy 副本),不得用物品类前缀。
 */
export function validateSkuBinding(input: {
  type: string;
  sku: string;
  gameItemId: number | null;
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
    return null;
  }

  if (sku.startsWith(ITEMSEND_SKU_PREFIX) || sku.startsWith(TRANSMOG_ITEM_SKU_PREFIX)) {
    return {
      code: "SKU_TYPE_MISMATCH",
      field: "sku",
      message: "服务类商品不能使用物品类 SKU(itemsend_ / transmog-item_)。",
    };
  }
  if (parseServiceSku(sku) === null) {
    return {
      code: "SKU_HANDLER_UNBOUND",
      field: "sku",
      message: "服务类 SKU 未绑定发货处理器,请从下拉列表中选择。",
    };
  }
  return null;
}
