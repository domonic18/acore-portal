import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { listAllSidebarCards } from "@/server/services/sidebar/query";
import { saveSidebarCards } from "@/server/services/sidebar/save";

// GET:后台侧栏快捷卡全量(按 sort)
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  return apiOk({ cards: await listAllSidebarCards() });
}

const putSchema = z.object({ cards: z.array(z.unknown()) });

// PUT:整树保存(增删改排序一次提交)
export async function PUT(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, putSchema);
  if (!parsed.ok) return parsed.response;
  const result = await saveSidebarCards(parsed.data.cards, {
    id: BigInt(guard.session.userId),
  });
  if (!result.ok) {
    return apiError(422, result.code, result.message);
  }
  return apiOk({ ok: true });
}
