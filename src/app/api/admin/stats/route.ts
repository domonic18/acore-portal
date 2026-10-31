import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { getDashboard } from "@/server/services/stats/dashboard";

/** 契约 api-admin-m4 §GET /api/admin/stats:requireAdmin,五区块聚合 */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk(await getDashboard());
}
