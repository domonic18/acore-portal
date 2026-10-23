import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { registerAccount } from "@/server/services/auth/register";

/**
 * 契约:202 受理不泄露占用以外的信息;错误码按 contracts/api-auth.md。
 * 范围调整(2026-10-23):M1 注册不要求邀请码,invitation_code 兼容接收但忽略
 * (邀请码必填随 P2 邀请码迭代回归)。
 */
const schema = z.object({
  username: z.string().min(1).max(64),
  email: z.string().email(),
  invitation_code: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");

  const outcome = await registerAccount(parsed.data, { ip });
  if (!outcome.ok) {
    switch (outcome.reason) {
      case "invalid_username":
        return apiError(
          422,
          "VALIDATION_ERROR",
          "用户名需 2-32 个字符,且不能包含 @。",
        );
      case "username_taken":
        return apiError(422, "USERNAME_TAKEN", "该用户名已被占用。");
      case "email_taken":
        return apiError(422, "EMAIL_TAKEN", "该邮箱已被注册。");
      case "username_conflict":
        return apiError(409, "USERNAME_CONFLICT", "该用户名刚刚被他人注册,请换一个。");
      case "game_db_unavailable":
        return apiError(
          503,
          "GAME_DB_UNAVAILABLE",
          "注册未完成:服务暂时不可用,请稍后重试。",
        );
    }
  }
  return NextResponse.json(
    { message: "注册受理成功,激活邮件将很快送达,请查收(含垃圾箱)。" },
    { status: 202 },
  );
}
