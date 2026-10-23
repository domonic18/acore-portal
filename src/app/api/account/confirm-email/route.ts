import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { confirmEmailChange } from "@/server/services/auth/password";

const schema = z.object({ token: z.string().min(10).max(128) });

/** 邮件链接点击后的确认端点;token 即凭证,不要求登录态 */
export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const ip = req.headers.get("x-forwarded-for");
  const outcome = await confirmEmailChange({
    tokenPlain: parsed.data.token,
    ip,
  });
  if (outcome.ok) {
    return apiOk({ message: "新邮箱绑定成功。", email: outcome.email });
  }
  if (outcome.reason === "email_taken") {
    return apiError(409, "EMAIL_TAKEN", "该邮箱已被其他账号使用,请重新发起换绑。");
  }
  return apiError(422, "INVALID_TOKEN", "链接无效或已过期,请在设置页重新发起换绑。");
}
