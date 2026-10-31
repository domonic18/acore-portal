import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listMigrationReviews } from "@/server/services/orders/admin";

/** D3 复核清单列表(T062):?resolved=0|1|all(默认待复核)&page= */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const resolved = new URL(req.url).searchParams.get("resolved") ?? "0";
  const page = Number(new URL(req.url).searchParams.get("page") ?? "1");
  if (!["0", "1", "all"].includes(resolved)) {
    return apiError(422, "INVALID_RESOLVED", "resolved 仅支持 0/1/all。");
  }
  const result = await listMigrationReviews({
    resolved: resolved as "0" | "1" | "all",
    page,
  });
  return apiOk(result);
}
