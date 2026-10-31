import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { unreadCount } from "@/server/services/notification/inbox";

/** 契约:200 {count};弹泡轮询用 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  return apiOk({ count: await unreadCount(BigInt(session.userId)) });
}
