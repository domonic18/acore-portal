import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  generateInvitationCodes,
  INVITATION_COUNT_MAX,
  UsersAdminError,
} from "@/server/services/users-admin/admin";

const schema = z.object({
  prefix: z
    .string()
    .min(2)
    .max(10)
    .regex(/^[A-Z0-9]+$/, "前缀仅限大写字母/数字"),
  length: z.coerce.number().int().min(6).max(32),
  count: z.coerce.number().int().min(1).max(INVITATION_COUNT_MAX),
  maxUses: z.coerce.number().int().min(1).max(9999),
  expiresAt: z.coerce.date().nullable().optional(),
});

/** 邀请码批量生成(M1 表复用;随机段≥4;审计 invitation_generated) */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const codes = await generateInvitationCodes({
      ...parsed.data,
      expiresAt: parsed.data.expiresAt ?? null,
      operatorId: BigInt(guard.session.userId),
      ip: req.headers.get("x-forwarded-for"),
    });
    return apiOk({ codes }, 201);
  } catch (err) {
    if (err instanceof UsersAdminError && err.code === "PARAM_INVALID") {
      return apiError(422, "PARAM_INVALID", err.message);
    }
    throw err;
  }
}
