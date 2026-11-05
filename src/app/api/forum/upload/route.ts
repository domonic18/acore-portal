import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { getApiSession } from "@/server/session-guard";
import { reserveQuota } from "@/lib/redis/rate-limit";
import { uploadMediaAssets } from "@/server/services/media/library";
import { MEDIA_CATEGORY_FORUM } from "@/constants/media";

/**
 * 论坛图片上传(#34 2026-11-04):登录用户专用通道(与管理端 /api/admin/media 分离)。
 * 仅 image/*、单张 ≤5MB(管理端为 10MB+PDF);频控 10 张/小时 per-user,
 * 按实际张数原子扣减(issue #76:批量不再绕过配额,超额整批拒绝)。
 * media_asset.category="论坛图片" 便于审计区分。
 */
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;
const QUOTA_PER_HOUR = 10;

export async function POST(req: NextRequest) {
  const session = await getApiSession(req);
  if (!session) return apiError(401, "UNAUTHORIZED", "请先登录。");

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
  if (files.length > MAX_FILES_PER_REQUEST) {
    return apiError(422, "VALIDATION_ERROR", `单次最多上传 ${MAX_FILES_PER_REQUEST} 张图片。`);
  }
  for (const f of files) {
    if (!f.type.startsWith("image/")) {
      return apiError(422, "TYPE_REJECTED", "论坛仅支持图片格式。");
    }
    if (f.size > MAX_BYTES) {
      return apiError(413, "TOO_LARGE", `单张图片不得超过 5MB:${f.name}`);
    }
  }

  // 按张数原子检查+扣减:余量不足整批拒绝,不写存储、不部分消费
  const quota = await reserveQuota(`rl:forum-upload:${session.userId}`, {
    windowSec: 3600,
    max: QUOTA_PER_HOUR,
    n: files.length,
  });
  if (!quota.allowed) {
    return apiError(
      429,
      "RATE_LIMITED",
      `已达每小时 ${QUOTA_PER_HOUR} 张上传上限,请 ${quota.retryAfterSec ?? 3600} 秒后再试。`,
    );
  }

  const prepared = await Promise.all(
    files.map(async (f) => ({
      name: f.name,
      mimeType: f.type,
      bytes: new Uint8Array(await f.arrayBuffer()),
      category: MEDIA_CATEGORY_FORUM,
    })),
  );
  const items = await uploadMediaAssets(prepared, BigInt(session.userId));
  // 论坛图片统一站内代理路径(/uploads/{cosKey}),不暴露 COS 直链;
  // 由 /uploads 路由本地优先/COS 回源供给
  return apiOk({
    items: items.map((i) => ({ url: `/uploads/${i.cosKey}`, originalName: i.originalName })),
  });
}
