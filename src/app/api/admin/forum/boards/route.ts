import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { ForumAdminError, createBoard } from "@/server/services/forum/admin";

const schema = z.object({
  slug: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(255).optional().nullable(),
  sort: z.number().int().min(0).max(9999).optional(),
});

/** 新建版块 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const created = await createBoard({
      ...parsed.data,
      actorId: BigInt(guard.session.userId),
    });
    return apiOk({ id: created.id.toString() });
  } catch (err) {
    if (err instanceof ForumAdminError) {
      if (err.code === "BOARD_SLUG_DUPLICATE") {
        return apiError(409, "BOARD_SLUG_DUPLICATE", err.message);
      }
      return apiError(422, "SLUG_INVALID", err.message);
    }
    throw err;
  }
}
