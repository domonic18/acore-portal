import { z } from "zod";
import { ITEMSEND_SKU_PREFIX } from "@/constants/shop";

/**
 * SKU 参数矩阵(soap-delivery §SKU→处理器 同源;加购与 US4 发货处理器
 * validateSchema 共用,双重把关):物品类 itemsend_* 一律必选角色(D6:
 * 不移植 acore_msg_dest,物品寄下单所选角色);服务类按处理器键校验。
 * 解锁名规范化(首字母大写)在 schema 内 transform,入车即落规范化值;
 * 占用/目标账号存在性等动态关在处理器 precheck(结账 422 + 发货行 failed 双拦)。
 */

export type CartParams = {
  characterGuid?: number;
  restoreItemEntry?: number;
  destAccount?: string;
  guildName?: string;
  unlockName?: string;
};

export type ValidatedCartParams = CartParams & { characterGuid: number };

const guidSchema = z.coerce.number().int().positive();
const destAccountSchema = z.string().trim().min(2).max(32);

/** WoW 角色名惯例:首字母大写其余小写;入车即规范化(quickstart S4) */
const unlockNameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z][A-Za-z0-9]{1,11}$/, "名字须为 2-12 位字母或数字,且字母开头")
  .transform((v) => v.charAt(0).toUpperCase() + v.slice(1).toLowerCase());

/** 公会名:2-24 位字母/数字/汉字,可含内部空格与 -';首尾不得为空格 */
const guildNameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(
    /^(?=.{2,24}$)[\p{L}\p{N}][\p{L}\p{N}\s'-]*[\p{L}\p{N}]$/u,
    "公会名须为 2-24 位字母、数字或汉字,可含空格与 -'",
  );

/** 服务类 SKU → 参数 schema(soap-delivery 映射表) */
export const CART_PARAM_SCHEMAS: Record<string, z.ZodType<ValidatedCartParams>> = {
  "item-restoration": z
    .object({ characterGuid: guidSchema, restoreItemEntry: guidSchema })
    .strict(),
  "char-change-race": z.object({ characterGuid: guidSchema }).strict(),
  "char-change-faction": z.object({ characterGuid: guidSchema }).strict(),
  "char-change-customize": z.object({ characterGuid: guidSchema }).strict(),
  "char-change-name": z.object({ characterGuid: guidSchema }).strict(),
  "name-unlock": z
    .object({ characterGuid: guidSchema, unlockName: unlockNameSchema })
    .strict(),
  "char-transfer": z
    .object({ characterGuid: guidSchema, destAccount: destAccountSchema })
    .strict(),
  "char-clone": z
    .object({ characterGuid: guidSchema, destAccount: destAccountSchema })
    .strict(),
  "guild-change": z
    .object({ characterGuid: guidSchema, guildName: guildNameSchema })
    .strict(),
};

/** itemsend_{id}(幻化单件/套装/外观重置等以物品为载体的形态) */
export const ITEM_SEND_PARAM_SCHEMA: z.ZodType<ValidatedCartParams> = z
  .object({ characterGuid: guidSchema })
  .strict();

export function resolveParamSchema(sku: string): z.ZodType<ValidatedCartParams> | null {
  if (sku.startsWith(ITEMSEND_SKU_PREFIX)) return ITEM_SEND_PARAM_SCHEMA;
  return CART_PARAM_SCHEMAS[sku] ?? null;
}

/** 详情页渲染参数表单所需的字段键(null=未注册 SKU,前端呈现"暂不支持购买") */
export function cartParamFields(sku: string): (keyof CartParams)[] | null {
  const schema = resolveParamSchema(sku);
  if (!schema) return null;
  const obj = schema as unknown as z.ZodObject<z.ZodRawShape>;
  return Object.keys(obj.shape) as (keyof CartParams)[];
}

export type CartParamsOutcome =
  | { ok: true; params: ValidatedCartParams }
  | { ok: false; reason: "PARAM_INVALID" | "NO_HANDLER" };

/** 未注册 SKU(服务类)与未命中矩阵的物品类一律 NO_HANDLER(FR-126 同源防线) */
export function validateCartParams(sku: string, params: unknown): CartParamsOutcome {
  const schema = resolveParamSchema(sku);
  if (!schema) return { ok: false, reason: "NO_HANDLER" };
  const parsed = schema.safeParse(params ?? {});
  if (!parsed.success) return { ok: false, reason: "PARAM_INVALID" };
  return { ok: true, params: parsed.data };
}

/** 矩阵内 SKU 取 schema(处理器声明用;矩阵缺行=代码缺陷,快速失败) */
export function schemaOf(sku: string): z.ZodType<ValidatedCartParams> {
  const schema = resolveParamSchema(sku);
  if (!schema) throw new Error(`SKU 参数矩阵缺失: ${sku}`);
  return schema;
}

/**
 * 参数规范化串(同参数合并行比较用):MySQL Json 落库会重排键序,
 * 以排序键 + 确定性序列化后的字符串为比较基准。
 */
export function normalizeCartParams(params: CartParams): string {
  const clean = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(Object.fromEntries(clean));
}
