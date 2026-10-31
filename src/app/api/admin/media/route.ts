import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/server/http";
import { requireApiAdmin } from "@/server/session-guard";
import {
  MediaError,
  listMediaAssets,
  uploadMediaAssets,
} from "@/server/services/media/library";

/** 媒体错误映射:422=类型/大小,404=不存在,503=COS 不可达(拒绝保存不放行) */
function mapMediaError(err: unknown) {
  if (err instanceof MediaError) {
    return apiError(
      err.code === "NOT_FOUND" ? 404 : err.code === "COS_UNAVAILABLE" ? 503 : 422,
      err.code,
      err.message,
    );
  }
  throw err;
}

/** 媒体列表(R13:20/页,q=文件名搜索,category=分类筛选;counts 供 tab 计数) */
export async function GET(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  const sp = new URL(req.url).searchParams;
  const page = Number(sp.get("page") ?? "1");
  const result = await listMediaAssets({
    page: Number.isInteger(page) && page > 0 ? page : 1,
    q: sp.get("q") ?? undefined,
    category: sp.get("category") ?? undefined,
  });
  return apiOk(result);
}

/**
 * 上传(multipart 多文件,FR-217):白名单 image/*+pdf,单文件 ≤10MB;
 * cosKey 按 sha256 幂等,重复内容复用资产行零重复上传。返回资产行(编辑器插 url)。
 */
export async function POST(req: NextRequest) {
  const guard = await requireApiAdmin(req);
  if (!guard.ok) return apiError(guard.status, guard.code, guard.message);
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return apiError(422, "VALIDATION_ERROR", "请求须为 multipart/form-data");
  }
  const files = [...form.getAll("files").filter((f): f is File => f instanceof File)];
  if (files.length === 0) {
    return apiError(422, "VALIDATION_ERROR", "参数错误:files");
  }
  const category = form.get("category");
  try {
    const inputs = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        mimeType: f.type,
        bytes: new Uint8Array(await f.arrayBuffer()),
        category: typeof category === "string" ? category : undefined,
      })),
    );
    const items = await uploadMediaAssets(inputs, BigInt(guard.session.userId));
    return apiOk({ items }, 201);
  } catch (err) {
    return mapMediaError(err);
  }
}
