import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { requestPasswordReset } from "@/server/services/auth/password";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { IP_HOURLY_WINDOW_SEC, pwresetIpKey } from "@/constants/security";

const schema = z.object({ email: z.string().email() });

/**
 * 契约:恒定 202,不泄露邮箱存在性(FR-013 同源);
 * 限速 ≥60s/次、≤5 次/天(服务层按邮箱哈希计数)。
 * 追加按 IP 限速:否则攻击者可跨目标邮件轰炸(按邮箱计数的限速拦不住)。
 */
const RATE_LIMIT_429 = "尝试过于频繁,请稍后再试。";

export async function POST(req: NextRequest) {
  const ip = await getClientIp(req);
  const { security } = await getConfig();

  const gate = await throttleByClientIp({
    ip,
    keyFor: pwresetIpKey,
    max: security.pwresetIpMaxPerHour,
    windowSec: IP_HOURLY_WINDOW_SEC,
  });
  if (!gate.allowed) {
    if (gate.reason === "unavailable") {
      return apiError(503, "AUTH_UNAVAILABLE", "找回密码服务暂时不可用,请稍后再试。");
    }
    return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  await requestPasswordReset(parsed.data.email, { ip });
  return NextResponse.json(
    { message: "若该邮箱已注册,重置邮件将很快送达,请查收(含垃圾箱)。" },
    { status: 202 },
  );
}
