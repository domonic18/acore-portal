import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  ProductAdminError,
  duplicateProduct,
} from "@/server/services/catalog/admin";

/** 复制商品(仅服务类);副本为草稿,sku/slug 追加 -copy 避让 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  try {
    const created = await duplicateProduct(BigInt(id), BigInt(guard.session.userId));
    return apiOk({ id: created.id.toString() }, 201);
  } catch (err) {
    if (err instanceof ProductAdminError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
}
