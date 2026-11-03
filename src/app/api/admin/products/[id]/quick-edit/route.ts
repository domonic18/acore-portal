import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { ProductAdminError, updateProductQuickEdit } from "@/server/services/catalog/admin";

/**
 * 商品列表快速编辑(用户反馈 2026-11-03):PATCH 部分高频字段
 * (价格/促销价/库存/状态/目录显隐/首页精选),不碰 sku/slug/categoryId;
 * 404=商品不存在,422=校验失败(促销价/服务类库存),400=服务类传库存。
 */
const quickEditSchema = z
  .object({
    price: z.coerce.number().int().positive().optional(),
    salePrice: z.coerce.number().int().min(0).nullable().optional(),
    stockEnabled: z.boolean().optional(),
    stock: z.coerce.number().int().min(0).nullable().optional(),
    status: z.enum(["draft", "published"]).optional(),
    listed: z.boolean().optional(),
    featured: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "缺少可更新字段" })
  .refine((v) => v.price === undefined || v.salePrice === undefined || v.salePrice === null || v.salePrice < v.price, {
    message: "促销价必须低于原价",
    path: ["salePrice"],
  });

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  const parsed = await parseBody(req, quickEditSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await updateProductQuickEdit(
      BigInt(id),
      parsed.data,
      BigInt(guard.session.userId),
    );
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError) {
      if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
      if (err.code === "STOCK_NOT_APPLICABLE") {
        return apiError(400, "STOCK_NOT_APPLICABLE", err.message);
      }
      return apiError(422, err.code, err.message);
    }
    throw err;
  }
}
