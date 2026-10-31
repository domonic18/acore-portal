import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { requireApiModerator } from "@/server/session-guard";
import { ForumModerateError, labelThread } from "@/server/services/forum/moderate";

// label 收 string:closed 等非法值须命中服务层契约 422 LABEL_INVALID,而非 zod 泛化校验错误
const schema = z.object({ label: z.string() });

/** 状态标签流转(契约:仅 none/standard/resolved;closed 仅经 close 接口设置) */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireApiModerator(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
  }
  try {
    const thread = await labelThread(BigInt(id), parsed.data.label, {
      id: BigInt(guard.session.userId),
    });
    return apiOk({ label: thread.statusLabel });
  } catch (err) {
    if (err instanceof ForumModerateError) {
      if (err.code === "THREAD_NOT_FOUND") {
        return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
      }
      if (err.code === "LABEL_INVALID") {
        return apiError(422, "LABEL_INVALID", "非法状态标签。");
      }
    }
    throw err;
  }
}
