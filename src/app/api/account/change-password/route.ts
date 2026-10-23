import "server-only";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getSessionFromToken } from "@/lib/auth/session";
import { SESSION } from "@/constants/session";
import { changePassword } from "@/server/services/auth/password";

const schema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: z.string().min(1).max(128),
});

/** 登录态改密(RSC/API 层一律深校验,middleware 只是浅守卫) */
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
  const outcome = await changePassword({
    userId: BigInt(session.userId),
    currentPassword: parsed.data.current_password,
    newPassword: parsed.data.new_password,
    ip,
  });
  if (outcome.ok) {
    // 全部会话已吊销(含当前):客户端清 Cookie 回登录页
    return apiOk({ message: "密码已更新,请重新登录。" });
  }
  switch (outcome.reason) {
    case "weak_password":
      return apiError(
        422,
        "WEAK_PASSWORD",
        outcome.message ?? "密码需至少 8 位且包含字母和数字。",
      );
    case "game_sync_failed":
      return apiError(
        503,
        "GAME_SYNC_PENDING",
        "密码未变更:游戏端同步暂时失败,请稍后重试(旧密码仍有效)。",
      );
    case "concurrent_change":
      return apiError(409, "CONCURRENT_CHANGE", "正在处理另一次密码修改,请稍候。");
    case "banned":
      return apiError(403, "ACCOUNT_BANNED", "账号状态异常。");
    default:
      return apiError(400, "WRONG_PASSWORD", "当前密码不正确。");
  }
}
