import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { listInbox } from "@/server/services/notification/inbox";

/** 契约:200 {items,nextCursor};游标分页(createdAt desc, id desc) */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  if (cursor && !/^\d+$/.test(cursor)) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:cursor");
  }
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "10", 10);

  const page = await listInbox(BigInt(session.userId), cursor, limit);
  return apiOk(page);
}
