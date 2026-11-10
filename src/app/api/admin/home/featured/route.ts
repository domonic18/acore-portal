import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  FeaturedAdminError,
  addFeaturedProduct,
  removeFeaturedProduct,
  reorderFeaturedProducts,
} from "@/server/services/home/featured";

/**
 * 首页精选商品管理(/admin/home):
 * POST 加入(展示序追加末位)/ PUT 全量重排 / DELETE?productId= 移出。
 * productId 用十进制字符串入参(BigInt JSON 不可序列化)。
 */
const productIdSchema = z.string().regex(/^\d+$/, "商品 ID 不合法");
const addSchema = z.object({ productId: productIdSchema });
const reorderSchema = z.object({ ids: z.array(productIdSchema).min(1).max(200) });

function toError(err: unknown) {
  if (!(err instanceof FeaturedAdminError)) throw err;
  if (err.code === "NOT_FOUND") return apiError(404, "NOT_FOUND", err.message);
  if (err.code === "SET_MISMATCH") return apiError(409, err.code, err.message);
  return apiError(422, err.code, err.message);
}

export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, addSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await addFeaturedProduct(BigInt(parsed.data.productId), BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return toError(err);
  }
}

export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, reorderSchema);
  if (!parsed.ok) return parsed.response;
  try {
    await reorderFeaturedProducts(
      parsed.data.ids.map((id) => BigInt(id)),
      BigInt(guard.session.userId),
    );
    return apiOk({ ok: true });
  } catch (err) {
    return toError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const productId = new URL(req.url).searchParams.get("productId") ?? "";
  if (!/^\d+$/.test(productId)) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  try {
    await removeFeaturedProduct(BigInt(productId), BigInt(guard.session.userId));
    return apiOk({ ok: true });
  } catch (err) {
    return toError(err);
  }
}
