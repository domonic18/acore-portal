import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  bulkSetThreadStatus,
  ForumModerateError,
} from "@/server/services/forum/moderate";
import { THREAD_LABEL_OPTIONS } from "@/constants/forum";

const schema = z.object({
  ids: z.array(z.string().regex(/^\d+$/)).min(1).max(200),
  status: z.enum(THREAD_LABEL_OPTIONS),
});

/**
 * 后台主题批量设状态(admin 专属):与单条同一写入路径,
 * 逐条落状态 + 逐条审计;单次上限 200 个主题。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const result = await bulkSetThreadStatus(
      parsed.data.ids.map((id) => BigInt(id)),
      parsed.data.status,
      { id: BigInt(guard.session.userId) },
    );
    return apiOk(result);
  } catch (err) {
    if (err instanceof ForumModerateError) {
      return apiError(422, err.code, "状态标签不合法。");
    }
    throw err;
  }
}
