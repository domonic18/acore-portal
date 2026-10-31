import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  ProductAdminError,
  saveProduct,
} from "@/server/services/catalog/admin";
import { GameDbError } from "@/server/services/shared/game-identity";

const productSchema = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    type: z.enum(["game_item", "service"]),
    sku: z.string().min(1).max(64),
    name: z.string().min(1).max(100),
    slug: z.string().min(1).max(100),
    description: z.string().max(2000).default(""),
    images: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(500)
          .refine((v) => v.startsWith("/") || /^https:\/\//.test(v), "图片须为站内路径或 https 地址"),
      )
      .max(20, "图片最多 20 张")
      .default([]),
    detailMd: z.string().max(200_000).default(""),
    categoryId: z.coerce.number().int().positive(),
    price: z.coerce.number().int().min(0),
    salePrice: z.coerce.number().int().min(0).nullable().optional(),
    saleStart: z.coerce.date().nullable().optional(),
    saleEnd: z.coerce.date().nullable().optional(),
    stockEnabled: z.boolean(),
    stock: z.coerce.number().int().min(0).nullable().optional(),
    lowStockThreshold: z.coerce.number().int().min(0).nullable().optional(),
    maxPerUser: z.coerce.number().int().min(1).nullable().optional(),
    gameItemId: z.coerce.number().int().positive().nullable().optional(),
    status: z.enum(["draft", "published"]),
    listed: z.boolean(),
  })
  .refine((v) => !(v.salePrice != null && v.salePrice >= v.price), {
    message: "促销价必须低于原价",
    path: ["salePrice"],
  });

/**
 * 商品新建/编辑(FR-126):SKU 保存校验在服务端;422=字段/SKU 校验失败,
 * 409=sku/slug 冲突,404=分类不存在,503=world 库不可达(拒绝保存不放行)。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, productSchema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveProduct({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
      categoryId: BigInt(parsed.data.categoryId),
      salePrice: parsed.data.salePrice ?? null,
      saleStart: parsed.data.saleStart ?? null,
      saleEnd: parsed.data.saleEnd ?? null,
      stock: parsed.data.stock ?? null,
      lowStockThreshold: parsed.data.lowStockThreshold ?? null,
      gameItemId: parsed.data.gameItemId ?? null,
      detailMd: parsed.data.detailMd.trim() || null,
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapProductError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, productSchema);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.id) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:id");
  }
  try {
    const { id } = await saveProduct({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
      categoryId: BigInt(parsed.data.categoryId),
      salePrice: parsed.data.salePrice ?? null,
      saleStart: parsed.data.saleStart ?? null,
      saleEnd: parsed.data.saleEnd ?? null,
      stock: parsed.data.stock ?? null,
      lowStockThreshold: parsed.data.lowStockThreshold ?? null,
      gameItemId: parsed.data.gameItemId ?? null,
      detailMd: parsed.data.detailMd.trim() || null,
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapProductError(err);
  }
}

function mapProductError(err: unknown) {
  if (err instanceof GameDbError) {
    return apiError(503, "GAME_DB_UNAVAILABLE", "游戏数据暂时不可用,请稍后重试。");
  }
  if (err instanceof ProductAdminError) {
    const status =
      err.code === "DUPLICATE"
        ? 409
        : err.code === "CATEGORY_NOT_FOUND" || err.code === "NOT_FOUND"
          ? 404
          : 422;
    return apiError(status, err.code, err.message);
  }
  throw err;
}
