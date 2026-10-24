import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { ProductAdminError, setProductStatus } from "@/server/services/catalog/admin";

const schema = z.object({
  status: z.enum(["draft", "published"]),
  listed: z.boolean().optional(),
});

/** 商品上下架/目录隐藏(FR-127);下架不影响历史订单行快照 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "商品不存在。");
  }
  try {
    await setProductStatus(BigInt(id), parsed.data.status, parsed.data.listed);
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof ProductAdminError && err.code === "NOT_FOUND") {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}
