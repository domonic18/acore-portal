import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { markRead } from "@/server/services/notification/inbox";

const readSchema = z
  .object({
    ids: z.array(z.string().regex(/^\d+$/)).min(1).max(100).optional(),
    all: z.boolean().optional(),
  })
  .refine((v) => v.all === true || (v.ids?.length ?? 0) > 0, {
    message: "ids 与 all 二选一",
  });

/** 契约:200 {marked};单条/批量/全部已读;已读不可逆 */
export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const parsed = await parseBody(req, readSchema);
  if (!parsed.ok) return parsed.response;

  const marked = await markRead(BigInt(session.userId), {
    ids: parsed.data.ids?.map((s) => BigInt(s)),
    all: parsed.data.all,
  });
  return apiOk({ marked });
}
