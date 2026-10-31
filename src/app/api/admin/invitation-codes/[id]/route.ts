import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  setInvitationCodeStatus,
  UsersAdminError,
} from "@/server/services/users-admin/admin";

const schema = z.object({
  status: z.enum(["available", "disabled"]),
});

/** 邀请码启停(M1 状态机;审计 invitation_disabled) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "NOT_FOUND", "邀请码不存在。");
  }
  try {
    await setInvitationCodeStatus(
      BigInt(id),
      parsed.data.status,
      BigInt(guard.session.userId),
      req.headers.get("x-forwarded-for"),
    );
    return apiOk({ ok: true });
  } catch (err) {
    if (err instanceof UsersAdminError && err.code === "NOT_FOUND") {
      return apiError(404, "NOT_FOUND", err.message);
    }
    throw err;
  }
}
