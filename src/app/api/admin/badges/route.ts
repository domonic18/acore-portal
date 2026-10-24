import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import { saveBadge, UsersAdminError } from "@/server/services/users-admin/admin";

const schema = z.object({
  id: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).max(64),
  level: z.coerce.number().int().min(1).max(99),
  description: z.string().max(255).nullable().optional(),
});

/** 徽章定义 CRUD(name/level/description);名称唯一 409 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const { id } = await saveBadge({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
      description: parsed.data.description ?? null,
    });
    return apiOk({ id: id.toString() }, 201);
  } catch (err) {
    return mapBadgeError(err);
  }
}

export async function PATCH(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  if (!parsed.data.id) return apiError(422, "VALIDATION_ERROR", "参数错误:id");
  try {
    const { id } = await saveBadge({
      ...parsed.data,
      id: parsed.data.id === undefined ? undefined : BigInt(parsed.data.id),
      description: parsed.data.description ?? null,
    });
    return apiOk({ id: id.toString() });
  } catch (err) {
    return mapBadgeError(err);
  }
}

function mapBadgeError(err: unknown) {
  if (err instanceof UsersAdminError) {
    const status = err.code === "DUPLICATE" ? 409 : 404;
    return apiError(status, err.code, err.message);
  }
  throw err;
}
