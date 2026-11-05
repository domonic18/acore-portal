import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  INVITATION_LIMITS,
  INVITATION_PREFIX_PATTERN,
} from "@/constants/invitation";
import { generateInvitationCodes, UsersAdminError } from "@/server/services/users-admin/admin";

/** 边界一律取自 constants/invitation.ts(issue #80:路由与 service 不再各写一套) */
const schema = z
  .object({
    prefix: z
      .string()
      .min(INVITATION_LIMITS.PREFIX_MIN)
      .max(INVITATION_LIMITS.PREFIX_MAX)
      .regex(INVITATION_PREFIX_PATTERN, "前缀仅限大写字母/数字"),
    length: z.coerce
      .number()
      .int()
      .min(INVITATION_LIMITS.LENGTH_MIN)
      .max(INVITATION_LIMITS.LENGTH_MAX),
    count: z.coerce
      .number()
      .int()
      .min(INVITATION_LIMITS.COUNT_MIN)
      .max(INVITATION_LIMITS.COUNT_MAX),
    maxUses: z.coerce
      .number()
      .int()
      .min(INVITATION_LIMITS.MAX_USES_MIN)
      .max(INVITATION_LIMITS.MAX_USES_MAX),
    expiresAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => v.length - v.prefix.length - 1 >= INVITATION_LIMITS.RANDOM_BODY_MIN, {
    message: `总长度须留出 ${INVITATION_LIMITS.RANDOM_BODY_MIN} 位随机段`,
    path: ["length"],
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
