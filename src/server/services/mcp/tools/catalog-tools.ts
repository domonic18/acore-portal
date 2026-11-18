import "server-only";

import { z } from "zod";

import { MCP_SCOPE, MCP_TOOL } from "@/constants/mcp";
import { PRODUCT_STATUS, PRODUCT_TYPE, type ProductStatusValue } from "@/constants/shop";
import { deriveServiceSku, deriveSku } from "@/constants/shop-sku";
import {
  getAdminProduct,
  listAdminProducts,
} from "@/server/services/catalog/admin/product-list";
import { saveProduct, setProductStatus } from "@/server/services/catalog/admin/products";
import { listAdminCategories } from "@/server/services/catalog/admin/categories";
import { getGameItem } from "@/server/services/catalog/game-items";

import { defineTool, parseId, slugFromSku, type McpToolDef } from "./shared";

/**
 * 商品类工具分册(6 个)
 *
 * 写入一律走 services/catalog 的同一入口(saveProduct / setProductStatus),
 * **不因调用方是 AI 而放松校验**(SKU↔物品绑定、服务类处理器注册表、限购、
 * 可堆叠 `_stack` 后缀一律照旧)。不可逆操作(删档)不暴露给 MCP。
 */

const listProductsSchema = z.object({
  q: z.string().optional().describe("关键字:名称 / 别名 / SKU 任一包含即命中"),
  type: z
    .enum([PRODUCT_TYPE.GAME_ITEM, PRODUCT_TYPE.SERVICE])
    .optional()
    .describe("商品类别:game_item 物品类 / service 服务类"),
  categoryId: z.string().optional().describe("所属分类 id"),
  lowStock: z.boolean().optional().describe("只看低库存商品"),
  status: z.enum([PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED]).optional().describe("发布态"),
  listed: z.boolean().optional().describe("目录可见性(上下架)"),
  page: z.number().int().positive().optional().describe("页码,从 1 开始"),
  pageSize: z.number().int().positive().max(50).optional().describe("每页条数(上限 50)"),
});

const getProductSchema = z.object({
  id: z.string().describe("商品 id"),
});

const createProductSchema = z.object({
  type: z
    .enum([PRODUCT_TYPE.GAME_ITEM, PRODUCT_TYPE.SERVICE])
    .describe("商品类别:game_item 物品类 / service 服务类"),
  name: z.string().min(1).describe("商品名称"),
  slug: z.string().optional().describe("别名(URL 短名,全局唯一;缺省由 SKU 派生)"),
  description: z.string().optional().describe("商品描述"),
  categoryId: z.string().describe("所属分类 id"),
  price: z.number().nonnegative().describe("原价"),
  salePrice: z.number().nonnegative().nullable().optional().describe("促销价(须低于原价)"),
  gameItemId: z.number().int().positive().optional().describe("游戏物品 entry(物品类必填)"),
  handlerKey: z.string().optional().describe("发货处理器键(服务类必填,如 char-change-name)"),
  images: z.array(z.string()).optional().describe("商品图片地址列表"),
  detailMd: z.string().optional().describe("商品详情 Markdown"),
  stockEnabled: z.boolean().optional().describe("是否启用库存(物品类)"),
  stock: z.number().int().nonnegative().nullable().optional().describe("库存数量"),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional().describe("低库存阈值"),
  maxPerUser: z.number().int().positive().nullable().optional().describe("每人限购(服务类恒为 1)"),
  status: z
    .enum([PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED])
    .optional()
    .describe("发布态(缺省 draft)"),
  listed: z.boolean().optional().describe("是否在目录可见(缺省否)"),
  featured: z.boolean().optional().describe("是否首页精选"),
});

const updateProductSchema = z.object({
  id: z.string().describe("商品 id"),
  name: z.string().min(1).optional(),
  slug: z.string().optional().describe("别名(全局唯一)"),
  description: z.string().optional(),
  categoryId: z.string().optional().describe("所属分类 id"),
  price: z.number().nonnegative().optional(),
  salePrice: z.number().nonnegative().nullable().optional(),
  images: z.array(z.string()).optional(),
  detailMd: z.string().optional(),
  stockEnabled: z.boolean().optional(),
  stock: z.number().int().nonnegative().nullable().optional(),
  lowStockThreshold: z.number().int().nonnegative().nullable().optional(),
  maxPerUser: z.number().int().positive().nullable().optional(),
  status: z.enum([PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED]).optional(),
  listed: z.boolean().optional(),
  featured: z.boolean().optional(),
  sku: z.string().optional().describe("SKU 不可修改——该参数仅用于告知调用方会被拒绝"),
});

const setProductStatusSchema = z.object({
  id: z.string().describe("商品 id"),
  status: z.enum([PRODUCT_STATUS.DRAFT, PRODUCT_STATUS.PUBLISHED]).describe("发布态"),
  listed: z.boolean().optional().describe("是否在目录可见(不传=保持现值)"),
});

const listCategoriesSchema = z.object({});

export const CATALOG_TOOLS: McpToolDef[] = [
  defineTool({
    name: MCP_TOOL.LIST_PRODUCTS,
    title: "查询商品列表",
    description:
      "按关键字/类别/分类/发布态/库存等条件分页查询商城商品。查商品前先用它定位 id。",
    scope: MCP_SCOPE.READ,
    schema: listProductsSchema,
    run: async (args) => {
      let categoryId: bigint | undefined;
      if (args.categoryId !== undefined) {
        const parsed = parseId(args.categoryId, "categoryId");
        if (!parsed.ok) return parsed;
        categoryId = parsed.id;
      }
      const list = await listAdminProducts({
        q: args.q,
        type: args.type,
        categoryId,
        lowStock: args.lowStock,
        status: args.status,
        listed: args.listed,
        page: args.page,
        pageSize: args.pageSize,
      });
      return { ok: true, data: list };
    },
  }),

  defineTool({
    name: MCP_TOOL.GET_PRODUCT,
    title: "查询商品详情",
    description: "按 id 取商品全字段(SKU、价格、库存、发货依据 handlerKey、发布态等)。",
    scope: MCP_SCOPE.READ,
    schema: getProductSchema,
    run: async (args) => {
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      const detail = await getAdminProduct(parsed.id);
      if (!detail) {
        return { ok: false, code: "NOT_FOUND", message: "商品不存在。", field: "id" };
      }
      return { ok: true, data: detail, targetId: detail.id };
    },
  }),

  defineTool({
    name: MCP_TOOL.CREATE_PRODUCT,
    title: "新增商品",
    description:
      "新增商品。物品类必须给 gameItemId(SKU 由物品派生,含可堆叠 _stack 后缀);" +
      "服务类必须给 handlerKey(SKU 派生为处理器键)。缺省状态为草稿且目录不可见。",
    scope: MCP_SCOPE.WRITE,
    schema: createProductSchema,
    run: async (args) => {
      if (args.type === PRODUCT_TYPE.SERVICE) {
        if (!args.handlerKey) {
          return {
            ok: false,
            code: "SKU_HANDLER_UNBOUND",
            message: "服务类商品必须给出发货处理器键(handlerKey)。",
            field: "sku",
          };
        }
      } else if (args.gameItemId == null) {
        return {
          ok: false,
          code: "SKU_GAME_ITEM_REQUIRED",
          message: "物品类商品必须给出游戏物品 entry(gameItemId)。",
          field: "gameItemId",
        };
      }

      // SKU 由「所选物品 / 所选处理器」单向派生,调用方不得自拟
      let sku: string;
      let gameItemId: number | null = null;
      let handlerKey: string | null = null;
      if (args.type === PRODUCT_TYPE.SERVICE) {
        handlerKey = args.handlerKey!;
        sku = deriveServiceSku({ handlerKey, currentSku: null });
      } else {
        const item = await getGameItem(args.gameItemId!);
        if (!item) {
          return {
            ok: false,
            code: "SKU_GAME_ITEM_NOT_FOUND",
            message: `游戏物品 #${args.gameItemId} 不存在,请核对 entry。`,
            field: "gameItemId",
          };
        }
        gameItemId = item.entry;
        // 可堆叠物品必须带 _stack(一封邮件发多个);堆叠性由游戏数据决定,不由调用方选择
        sku = deriveSku({
          type: args.type,
          gameItemId: item.entry,
          stack: (item.stackable ?? 1) > 1,
        })!;
      }

      const category = parseId(args.categoryId, "categoryId");
      if (!category.ok) return category;

      const saved = await saveProduct({
        type: args.type,
        sku,
        name: args.name,
        slug: args.slug?.trim() || slugFromSku(sku),
        description: args.description ?? "",
        images: args.images ?? [],
        detailMd: args.detailMd ?? null,
        categoryId: category.id,
        price: args.price,
        salePrice: args.salePrice ?? null,
        saleStart: null,
        saleEnd: null,
        stockEnabled: args.type === PRODUCT_TYPE.GAME_ITEM ? (args.stockEnabled ?? false) : false,
        stock: args.stock ?? null,
        lowStockThreshold: args.lowStockThreshold ?? null,
        maxPerUser: args.maxPerUser ?? null,
        gameItemId,
        handlerKey,
        status: (args.status ?? PRODUCT_STATUS.DRAFT) as ProductStatusValue,
        listed: args.listed ?? false,
        featured: args.featured ?? false,
      });

      const detail = await getAdminProduct(saved.id);
      return {
        ok: true,
        data: { created: true, id: saved.id.toString(), product: detail },
        targetId: saved.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.UPDATE_PRODUCT,
    title: "修改商品",
    description:
      "按 id 修改商品的可变字段(名称/别名/描述/价格/库存/发布态等)。" +
      "SKU 是发货契约,不可修改——传 sku 会被拒绝。",
    scope: MCP_SCOPE.WRITE,
    schema: updateProductSchema,
    run: async (args) => {
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;

      const current = await getAdminProduct(parsed.id);
      if (!current) {
        return { ok: false, code: "NOT_FOUND", message: "商品不存在。", field: "id" };
      }
      if (args.sku !== undefined && args.sku !== current.sku) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          message: "SKU 不可修改:SKU 由所选物品/发货处理器派生,是发货契约。",
          field: "sku",
        };
      }

      let categoryId = BigInt(current.categoryId);
      if (args.categoryId !== undefined) {
        const c = parseId(args.categoryId, "categoryId");
        if (!c.ok) return c;
        categoryId = c.id;
      }

      const saved = await saveProduct({
        id: parsed.id,
        type: current.type as "game_item" | "service",
        sku: current.sku,
        name: args.name ?? current.name,
        slug: args.slug?.trim() || current.slug,
        description: args.description ?? current.description,
        images: args.images ?? current.images,
        detailMd: args.detailMd ?? current.detailMd,
        categoryId,
        price: args.price ?? current.price,
        salePrice: args.salePrice !== undefined ? args.salePrice : current.salePrice,
        saleStart: current.saleStart ? new Date(current.saleStart) : null,
        saleEnd: current.saleEnd ? new Date(current.saleEnd) : null,
        stockEnabled: args.stockEnabled ?? current.stockEnabled,
        stock: args.stock !== undefined ? args.stock : current.stock,
        lowStockThreshold:
          args.lowStockThreshold !== undefined ? args.lowStockThreshold : current.lowStockThreshold,
        maxPerUser: args.maxPerUser !== undefined ? args.maxPerUser : current.maxPerUser,
        gameItemId: current.gameItemId,
        handlerKey: current.handlerKey,
        status: (args.status ?? current.status) as ProductStatusValue,
        listed: args.listed ?? current.listed,
        featured: args.featured ?? current.featured,
      });

      const detail = await getAdminProduct(saved.id);
      return {
        ok: true,
        data: { updated: true, id: saved.id.toString(), product: detail },
        targetId: saved.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.SET_PRODUCT_STATUS,
    title: "设置商品发布态",
    description:
      "设置商品发布态(draft/published)与目录可见性(上下架)。下架只影响目录可见性,不影响已成立订单的发货。",
    scope: MCP_SCOPE.WRITE,
    schema: setProductStatusSchema,
    run: async (args) => {
      const parsed = parseId(args.id);
      if (!parsed.ok) return parsed;
      await setProductStatus(parsed.id, args.status, args.listed);
      const detail = await getAdminProduct(parsed.id);
      return {
        ok: true,
        data: {
          id: parsed.id.toString(),
          status: detail?.status ?? args.status,
          listed: detail?.listed ?? args.listed ?? null,
        },
        targetId: parsed.id.toString(),
      };
    },
  }),

  defineTool({
    name: MCP_TOOL.LIST_CATEGORIES,
    title: "查询商品分类",
    description: "取商品分类树(含层级与商品数)。新增商品前用它定位 categoryId。",
    scope: MCP_SCOPE.READ,
    schema: listCategoriesSchema,
    run: async () => {
      const tree = await listAdminCategories();
      return { ok: true, data: { categories: tree } };
    },
  }),
];
