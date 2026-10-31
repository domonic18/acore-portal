import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { batchSetProducts } from "@/server/services/catalog/admin";

const schema = z.object({
  ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200),
  action: z.enum(["publish", "draft", "list", "unlist"]),
});

/** 商品批量上下架/目录显隐(二期);单次上限 200 件,聚合审计一条 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const result = await batchSetProducts(
    parsed.data.ids.map((id) => BigInt(id)),
    parsed.data.action,
    BigInt(guard.session.userId),
  );
  return apiOk(result);
}
