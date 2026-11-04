import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getSiteUsername } from "@/server/services/shared/site-identity";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { ForumWriteError, createReply } from "@/server/services/forum/write";

/**
 * 回帖(#34 2026-11-04):登录用户;closed/软删主题 409;频控 per-user 30s/1 + 3600s/10。
 */
const schema = z.object({
  content: z.string().trim().min(2, "回帖内容至少 2 个字符").max(20_000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const threadId = Number(params.id);
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
  }

  const userId = session.userId;
  const fast = await hitRateLimit(`rl:forum-post-fast:${userId}`, { windowSec: 30, max: 1 });
  if (!fast.allowed) {
    return apiError(429, "RATE_LIMITED", `回帖过于频繁,请 ${fast.retryAfterSec ?? 30} 秒后再试。`);
  }
  const hourly = await hitRateLimit(`rl:forum-post-hour:${userId}`, { windowSec: 3600, max: 10 });
  if (!hourly.allowed) {
    return apiError(429, "RATE_LIMITED", `已达每小时 10 条上限,请 ${hourly.retryAfterSec ?? 3600} 秒后再试。`);
  }

  const authorName = await getSiteUsername(BigInt(userId));
  if (!authorName) return apiError(401, "UNAUTHORIZED", "账号状态异常,请重新登录。");

  try {
    const result = await createReply({
      threadId: BigInt(threadId),
      author: { id: BigInt(userId), name: authorName },
      content: parsed.data.content,
    });
    return apiOk({ postId: result.postId.toString(), floor: result.floor });
  } catch (err) {
    if (err instanceof ForumWriteError) {
      if (err.code === "THREAD_NOT_FOUND") return apiError(404, "THREAD_NOT_FOUND", "主题不存在。");
      if (err.code === "THREAD_CLOSED") return apiError(409, "THREAD_CLOSED", "主题已关闭,不再接受回帖。");
      if (err.code === "FLOOR_CONFLICT") {
        return apiError(409, "FLOOR_CONFLICT", "发布冲突,请刷新后重试。");
      }
    }
    throw err;
  }
}
