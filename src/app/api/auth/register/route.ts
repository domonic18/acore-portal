import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError, parseBody } from "@/server/http";
import { registerAccount } from "@/server/services/auth/register";
import { TURNSTILE_ERROR } from "@/constants/turnstile";
import { verifyTurnstile } from "@/lib/turnstile";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { IP_HOURLY_WINDOW_SEC, registerIpKey } from "@/constants/security";

/**
 * 契约:202 受理不泄露占用以外的信息;错误码按 contracts/api-auth.md。
 * 范围调整(2026-10-23):M1 注册不要求邀请码,invitation_code 兼容接收但忽略
 * (邀请码必填随 P2 邀请码迭代回归)。
 */
const schema = z.object({
  username: z.string().min(1).max(64),
  email: z.string().email(),
  invitation_code: z.string().optional(),
  turnstileToken: z.string().max(2048).optional().default(""),
});

/** 按 IP 限速命中(未鉴权端点,防 DB 放大);422/409 占用语义不变(按用户决策保留契约) */
const RATE_LIMIT_429 = "注册过于频繁,请稍后再试。";

export async function POST(req: NextRequest) {
  const ip = await getClientIp(req);
  const { security } = await getConfig();

  // 按 IP 限速:排在 body 解析与 Turnstile 之前——Redis 计数最便宜,
  // 且畸形请求体同样计入,否则洪水可绕开计数(每次请求都要打 4~5 次 DB 查询)
  const gate = await throttleByClientIp({
    ip,
    keyFor: registerIpKey,
    max: security.registerIpMaxPerHour,
    windowSec: IP_HOURLY_WINDOW_SEC,
  });
  if (!gate.allowed) {
    // Redis 故障:计数不可用 → 失败关闭(503),不得静默放行(限流形同虚设)
    if (gate.reason === "unavailable") {
      return apiError(503, "AUTH_UNAVAILABLE", "注册服务暂时不可用,请稍后再试。");
    }
    return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  // Turnstile 预检(仅拦机器人;注册无凭据猜测面,不做失败计数/锁定)
  const turnstile = await verifyTurnstile(parsed.data.turnstileToken, ip ?? undefined);
  if (!turnstile.ok) {
    if (turnstile.errors?.includes("not-configured")) {
      // 运维误配(已启用但密钥缺失):失败关闭,站点其余部分不受影响
      return apiError(422, TURNSTILE_ERROR.UNAVAILABLE.code, TURNSTILE_ERROR.UNAVAILABLE.message);
    }
    return apiError(422, TURNSTILE_ERROR.FAILED.code, TURNSTILE_ERROR.FAILED.message);
  }

  const outcome = await registerAccount(parsed.data, { ip });
  if (!outcome.ok) {
    switch (outcome.reason) {
      case "invalid_username":
        return apiError(422, "VALIDATION_ERROR", "用户名需 2-32 个字符,且不能包含 @。");
      case "username_taken":
        return apiError(422, "USERNAME_TAKEN", "该用户名已被占用。");
      case "email_taken":
        return apiError(422, "EMAIL_TAKEN", "该邮箱已被注册。");
      case "username_conflict":
        return apiError(409, "USERNAME_CONFLICT", "该用户名刚刚被他人注册,请换一个。");
      case "game_db_unavailable":
        return apiError(503, "GAME_DB_UNAVAILABLE", "注册未完成:服务暂时不可用,请稍后重试。");
    }
  }
  return NextResponse.json(
    { message: "注册受理成功,激活邮件将很快送达,请查收(含垃圾箱)。" },
    { status: 202 },
  );
}
