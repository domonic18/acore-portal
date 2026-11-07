import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { resetPassword } from "@/server/services/auth/password";
import { getClientIp } from "@/server/services/shared/client-ip";
import { throttleByClientIp } from "@/server/services/shared/ip-throttle";
import { getConfig } from "@/lib/config";
import { IP_HOURLY_WINDOW_SEC, pwresetIpKey } from "@/constants/security";
import { checkSameOrigin } from "@/server/origin-guard";

const schema = z.object({
  token: z.string().min(10).max(128),
  password: z.string().min(1).max(128),
});

/** 与申请找回共用同一个按 IP 桶——同一流程的两段 */
const RATE_LIMIT_429 = "尝试过于频繁,请稍后再试。";

export async function POST(req: NextRequest) {
  const origin = await checkSameOrigin(req);
  if (!origin.ok) return origin.response;
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
      return apiError(503, "AUTH_UNAVAILABLE", "密码重置服务暂时不可用,请稍后再试。");
    }
    return apiError(429, "RATE_LIMITED", RATE_LIMIT_429, {
      retryAfterSec: gate.retryAfterSec,
    });
  }

  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const outcome = await resetPassword({
    tokenPlain: parsed.data.token,
    newPassword: parsed.data.password,
    ip,
  });
  if (outcome.ok) {
    return apiOk({ message: "密码已重置,请使用新密码登录。" });
  }
  switch (outcome.reason) {
    case "weak_password":
      return apiError(422, "WEAK_PASSWORD", outcome.message ?? "密码需至少 8 位且包含字母和数字。");
    case "game_sync_failed":
      // FR-014:变更未完成,链接仍有效,恢复后可重试
      return apiError(
        503,
        "GAME_SYNC_PENDING",
        "密码修改未完成:游戏端同步暂时失败,链接仍有效,请稍后重试。",
      );
    case "banned":
      return apiError(403, "ACCOUNT_BANNED", "账号状态异常,无法重置密码。");
    case "concurrent_change":
      return apiError(409, "CONCURRENT_CHANGE", "正在处理另一次密码修改,请稍候重试。");
    default:
      return apiError(422, "INVALID_TOKEN", "链接无效或已过期,请重新申请找回。");
  }
}
