import type { NextRequest } from "next/server";
import { z } from "zod";
import { apiError, apiOk, parseBody } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { getSiteUsername } from "@/server/services/shared/site-identity";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { getForumBoardBySlug } from "@/server/services/forum/browse";
import { ForumWriteError, createThread } from "@/server/services/forum/write";

/**
 * 发新主题(#34 2026-11-04 开放):登录用户(role=user 及上),先发后审。
 * 频控双窗口 per-user:60s/1 + 3600s/3;超限 429 带 retryAfterSec。
 */
const schema = z.object({
  boardSlug: z.string().trim().regex(/^[a-z0-9-]{1,64}$/, "版块不合法"),
  title: z.string().trim().min(1, "标题必填").max(64),
  content: z.string().trim().min(2, "正文至少 2 个字符").max(20_000),
});

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.response;

  const userId = session.userId;
  const fast = await hitRateLimit(`rl:forum-thread-fast:${userId}`, { windowSec: 60, max: 1 });
  if (!fast.allowed) {
    return apiError(429, "RATE_LIMITED", `发布过于频繁,请 ${fast.retryAfterSec ?? 60} 秒后再试。`);
  }
  const hourly = await hitRateLimit(`rl:forum-thread-hour:${userId}`, { windowSec: 3600, max: 3 });
  if (!hourly.allowed) {
    return apiError(429, "RATE_LIMITED", `已达每小时 3 条上限,请 ${hourly.retryAfterSec ?? 3600} 秒后再试。`);
  }

  const authorName = await getSiteUsername(BigInt(userId));
  if (!authorName) return apiError(401, "UNAUTHORIZED", "账号状态异常,请重新登录。");

  const board = await getForumBoardBySlug(parsed.data.boardSlug);
  if (!board) return apiError(404, "BOARD_NOT_FOUND", "版块不存在。");

  try {
    const { threadId } = await createThread({
      boardId: board.id,
      author: { id: BigInt(userId), name: authorName },
      title: parsed.data.title,
      content: parsed.data.content,
    });
    return apiOk({ threadId: threadId.toString() });
  } catch (err) {
    if (err instanceof ForumWriteError && err.code === "BOARD_NOT_FOUND") {
      return apiError(404, "BOARD_NOT_FOUND", "版块不存在。");
    }
    throw err;
  }
}
