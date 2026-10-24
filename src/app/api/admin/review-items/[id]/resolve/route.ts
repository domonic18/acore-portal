import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { OrderAdminError, resolveMigrationReview } from "@/server/services/orders/admin";

/** D3 复核落定(T062;data-model §2.9):{ approve, note? } → completed/cancelled + 审计 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "复核项不存在。");
  }
  const body = (await req.json().catch(() => null)) as
    | { approve?: unknown; note?: unknown }
    | null;
  if (typeof body?.approve !== "boolean") {
    return apiError(422, "APPROVE_REQUIRED", "approve 必须为布尔值。");
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return apiError(422, "NOTE_INVALID", "note 必须为字符串。");
  }
  try {
    await resolveMigrationReview(
      BigInt(id),
      { approve: body.approve, note: typeof body.note === "string" ? body.note : undefined },
      BigInt(guard.session.userId),
      req.headers.get("x-forwarded-for"),
    );
    return apiOk({ resolved: true });
  } catch (err) {
    if (err instanceof OrderAdminError) {
      const status = err.code === "NOT_FOUND" ? 404 : 422;
      return apiError(status, err.code, err.message);
    }
    throw err;
  }
}
