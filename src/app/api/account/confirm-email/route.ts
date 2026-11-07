import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { confirmEmailChange } from "@/server/services/auth/password";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { IP_HOURLY_WINDOW_SEC, emailChangeIpKey } from "@/constants/security";
import { checkSameOrigin } from "@/server/origin-guard";

const schema = z.object({ token: z.string().min(10).max(128) });

/** 按 IP 限速命中;token 即凭证,不要求登录态 → 需防无效 token 的 DB 放大 */
const RATE_LIMIT_429 = "尝试过于频繁,请稍后再试。";

/** 邮件链接点击后的确认端点;token 即凭证,不要求登录态 */
export async function POST(req: NextRequest) {
  const origin = await checkSameOrigin(req);
  if (!origin.ok) return origin.response;
  const ip = await getClientIp(req);
  const { security } = await getConfig();

  const gate = await throttleByClientIp({
    ip,
    keyFor: emailChangeIpKey,
    max: security.emailChangeIpMaxPerHour,
    windowSec: IP_HOURLY_WINDOW_SEC,
  });
  if (!gate.allowed) {
    if (gate.reason === "unavailable") {
      return apiError(503, "AUTH_UNAVAILABLE", "服务暂时不可用,请稍后再试。");
    }
    return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
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
