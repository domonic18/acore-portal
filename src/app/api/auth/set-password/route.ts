import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { activateAccount } from "@/server/services/auth/register";
import { setSessionCookies } from "@/lib/auth/cookies";

/** 契约:激活即登录(200 + 登录态 Cookie);422 TOKEN_INVALID_OR_EXPIRED / WEAK_PASSWORD */
const schema = z.object({
  token: z.string().min(10).max(256),
  password: z.string().min(1).max(256),
});

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip");

  const outcome = await activateAccount({
    tokenPlain: parsed.data.token,
    password: parsed.data.password,
    ip,
  });
  if (!outcome.ok) {
    if (outcome.reason === "weak_password") {
      return apiError(
        422,
        "WEAK_PASSWORD",
        outcome.message ?? "密码需至少 8 位,同时包含字母和数字。",
      );
    }
    if (outcome.reason === "game_db_unavailable") {
      return apiError(
        503,
        "GAME_DB_UNAVAILABLE",
        "激活未完成:服务暂时不可用,链接仍有效,请稍后重试。",
      );
    }
    return apiError(
      422,
      "TOKEN_INVALID_OR_EXPIRED",
      "链接无效或已过期,请重新注册或申请重发激活邮件。",
    );
  }
  const res = NextResponse.json({ message: "设置成功,已进入登录态。" });
  setSessionCookies(res, { accessToken: outcome.accessToken });
  return res;
}
