import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import {
  listInbox,
  DEFAULT_LIMIT,
  MAX_LIMIT,
} from "@/server/services/notification/inbox";

/** 契约:200 {items,nextCursor};游标分页(createdAt desc, id desc) */
export async function GET(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  if (cursor && !/^\d+$/.test(cursor)) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:cursor");
  }
  // limit 边界校验(issue #75):非整数/超界/NaN 一律 422,不得以 NaN 入 Prisma
  const limitSchema = z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT);
  const limit = limitSchema.safeParse(url.searchParams.get("limit") ?? undefined);
  if (!limit.success) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:limit");
  }

  const page = await listInbox(BigInt(session.userId), cursor, limit.data);
  return apiOk(page);
}
