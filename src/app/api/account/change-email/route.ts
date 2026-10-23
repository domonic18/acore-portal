import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { requestEmailChange } from "@/server/services/auth/password";

const schema = z.object({
  new_email: z.string().email(),
  current_password: z.string().min(1).max(128),
});

/** 换邮箱:202 受理,确认邮件发往新邮箱;confirm 时刻才生效(FR-021) */
export async function POST(req: NextRequest) {
  const session = await getSessionFromToken(
    req.cookies.get(SESSION.ACCESS_COOKIE)?.value,
  );
  if (!session) {
    return apiError(401, "UNAUTHORIZED", "请先登录。");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const ip = req.headers.get("x-forwarded-for");
  const outcome = await requestEmailChange({
    userId: BigInt(session.userId),
    newEmailRaw: parsed.data.new_email,
    currentPassword: parsed.data.current_password,
    ip,
  });
  if (outcome.ok) {
    return apiOk(
      { message: "确认邮件已发往新邮箱,请查收并点击链接完成绑定。" },
      202,
    );
  }
  switch (outcome.reason) {
    case "email_taken":
      return apiError(409, "EMAIL_TAKEN", "该邮箱已被其他账号使用。");
    case "same_email":
      return apiError(422, "SAME_EMAIL", "新邮箱与当前邮箱相同。");
    case "rate_limited":
      return apiError(
        429,
        "RATE_LIMITED",
        `操作过于频繁,请 ${Math.ceil((outcome.retryAfterSec ?? 60) / 60)} 分钟后再试。`,
      );
    default:
      return apiError(400, "WRONG_PASSWORD", "当前密码不正确。");
  }
}
