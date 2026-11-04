import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { uploadMediaAssets } from "@/server/services/media/library";

/**
 * 论坛图片上传(#34 2026-11-04):登录用户专用通道(与管理端 /api/admin/media 分离)。
 * 仅 image/*、单张 ≤5MB(管理端为 10MB+PDF);频控 10 张/小时 per-user;
 * media_asset.category="论坛图片" 便于审计区分。
 */
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

  const limit = await hitRateLimit(`rl:forum-upload:${session.userId}`, {
    windowSec: 3600,
    max: 10,
  });
  if (!limit.allowed) {
    return apiError(429, "RATE_LIMITED", `已达每小时 10 张上传上限,请 ${limit.retryAfterSec ?? 3600} 秒后再试。`);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(422, "VALIDATION_ERROR", "请求体须为 multipart 表单。");
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return apiError(422, "VALIDATION_ERROR", "未选择文件。");
  }
  for (const f of files) {
    if (!f.type.startsWith("image/")) {
      return apiError(422, "TYPE_REJECTED", "论坛仅支持图片格式。");
    }
    if (f.size > MAX_BYTES) {
      return apiError(413, "TOO_LARGE", `单张图片不得超过 5MB:${f.name}`);
    }
  }

  const prepared = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      mimeType: f.type,
      bytes: new Uint8Array(await f.arrayBuffer()),
      category: "论坛图片",
    })),
  );
  const items = await uploadMediaAssets(prepared, BigInt(session.userId));
  return apiOk({ items: items.map((i) => ({ url: i.url, originalName: i.originalName })) });
}
