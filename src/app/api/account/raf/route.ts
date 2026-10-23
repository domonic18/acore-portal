import "server-only";
import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";

/** 契约:M1 结构就绪空态;数据 M2 接入 */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  return apiOk({ recruited: [], total: 0 });
}
