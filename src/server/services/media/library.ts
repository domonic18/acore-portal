import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { MEDIA_CATEGORY_VIDEO, MEDIA_DEFAULT_CATEGORY } from "@/constants/media";
import { MEDIA_PAGE_SIZE } from "@/constants/pagination";
import { paginate } from "@/lib/pagination";
import {
  MIME_BY_EXT,
  deleteLocalMedia,
  isLocalMediaUrl,
  isValidLocalMediaKey,
  localMediaUrl,
  readLocalMedia,
  writeLocalMedia,
} from "@/lib/media/local-store";
import { writeAudit } from "@/server/services/shared/audit";
import { CosNotConfiguredError, getCosClient } from "@/lib/cos/client";

/**
 * 媒体库最小集(R13/FR-217,api-admin-m3 媒体节):
 * 白名单 image/*+pdf+video/mp4|webm,图片/PDF 单文件 ≤10MB、视频 ≤50MB;
 * cosKey=media/{yyyyMMdd}/{sha256}{ext} 按 hash 幂等(同内容复用资产行,零重复上传);
 * COS 已配置→cdnBase+cosKey,未配置→本地 workspace/uploads 回退(开发/测试无对象存储仍可上传);
 * 删除按 url 分流。
 */

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;
/** 视频上限 50MB(应用层闸门;公网测试栈 nginx 需另配 client_max_body_size) */
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

const VIDEO_MIMES = new Set(["video/mp4", "video/webm"]);

function isVideoMime(mime: string): boolean {
  return mime.startsWith("video/");
}

export class MediaError extends Error {
  constructor(
    public code:
      | "TYPE_REJECTED"
      | "TOO_LARGE"
      | "NOT_FOUND"
      | "COS_UNAVAILABLE"
      | "STORAGE_UNAVAILABLE",
    message?: string,
  ) {
    super(message ?? `media_error: ${code}`);
    this.name = "MediaError";
  }
}

export function mediaErrorStatus(code: MediaError["code"]): number {
  if (code === "NOT_FOUND") return 404;
  if (code === "COS_UNAVAILABLE" || code === "STORAGE_UNAVAILABLE") return 503;
  return 422;
}

export type MediaUploadInput = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
  category?: string;
};

export type MediaAssetDto = {
  id: string;
  cosKey: string;
  url: string;
  originalName: string;
  category: string;
  sizeBytes: number;
  mimeType: string;
};

function normalizeCategory(raw: string | undefined): string {
  const trimmed = raw?.trim() ?? "";
  return trimmed ? trimmed.slice(0, 64) : MEDIA_DEFAULT_CATEGORY;
}

function isAllowedMime(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf" || VIDEO_MIMES.has(mime);
}

/** 单文件体积上限:视频走视频档(图文 10MB / 视频 50MB) */
function maxBytesFor(mime: string): number {
  return isVideoMime(mime) ? MEDIA_VIDEO_MAX_BYTES : MEDIA_MAX_BYTES;
}

/**
 * 落库分类:视频一律归「视频」——分类名此前只是 UI 约定(前端传什么存什么),
 * 不强制则视频会散落进「其他」,等于没有专门分类。
 */
function resolveCategory(raw: string | undefined, mime: string): string {
  if (isVideoMime(mime)) return MEDIA_CATEGORY_VIDEO;
  return normalizeCategory(raw);
}

function safeExt(name: string, mime: string): string {
  const raw = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (/^\.[a-z0-9]{1,8}$/i.test(raw)) return raw.toLowerCase();
  if (mime === "application/pdf") return ".pdf";
  // 视频兜底扩展名必须与 mime 对应:本地回退按扩展名还原 content-type,
  // 错扩展名 + nosniff 会让浏览器直接拒绝播放
  if (mime === "video/mp4") return ".mp4";
  if (mime === "video/webm") return ".webm";
  return ".bin";
}

function dateSegment(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export async function uploadMediaAssets(
  files: readonly MediaUploadInput[],
  uploaderId: bigint,
): Promise<MediaAssetDto[]> {
  for (const f of files) {
    if (!isAllowedMime(f.mimeType)) {
      throw new MediaError("TYPE_REJECTED", `不支持的文件类型:${f.mimeType || "未知"}`);
    }
    const limit = maxBytesFor(f.mimeType);
    if (f.bytes.byteLength > limit) {
      const limitMb = Math.round(limit / 1024 / 1024);
      throw new MediaError("TOO_LARGE", `单文件不得超过 ${limitMb}MB:${f.name}`);
    }
  }
  const storage = await resolveStorage();
  const out: MediaAssetDto[] = [];
  for (const f of files) {
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    const cosKey = `media/${dateSegment()}/${sha256}${safeExt(f.name, f.mimeType)}`;
    const existing = await prisma.mediaAsset.findUnique({ where: { cosKey } });
    if (existing) {
      out.push(toDto(existing));
      continue;
    }
    let url: string;
    if (storage) {
      try {
        await storage.client.putObject({
          Bucket: storage.config.bucket,
          Region: storage.config.region,
          Key: cosKey,
          Body: Buffer.from(f.bytes),
          ContentType: f.mimeType,
        });
      } catch {
        throw new MediaError("COS_UNAVAILABLE", "对象存储暂不可用,请稍后重试。");
      }
      url = `${storage.config.cdnBase.replace(/\/?$/, "")}/${cosKey}`;
    } else {
      try {
        await writeLocalMedia(cosKey, f.bytes);
      } catch {
        throw new MediaError(
          "STORAGE_UNAVAILABLE",
          "本地存储不可用,请检查 workspace 目录写入权限。",
        );
      }
      url = localMediaUrl(cosKey);
    }
    const row = await prisma.mediaAsset.create({
      data: {
        cosKey,
        url,
        originalName: f.name,
        category: resolveCategory(f.category, f.mimeType),
        sizeBytes: f.bytes.byteLength,
        mimeType: f.mimeType,
        uploadedBy: uploaderId,
      },
    });
    out.push(toDto(row));
  }
  return out;
}

function toDto(row: {
  id: bigint;
  cosKey: string;
  url: string;
  originalName: string;
  category: string;
  sizeBytes: number;
  mimeType: string;
}): MediaAssetDto {
  return {
    id: row.id.toString(),
    cosKey: row.cosKey,
    url: row.url,
    originalName: row.originalName,
    category: row.category,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
  };
}

export async function listMediaAssets(opts: {
  page?: number;
  q?: string;
  category?: string;
  /** 按 mime 前缀过滤:图片位只列 image/*,视频位只列 video/* */
  mimeKind?: "image" | "video";
}): Promise<{
  items: Array<MediaAssetDto & { createdAt: string }>;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  counts: Record<string, number>;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const category = opts.category?.trim() || undefined;
  const where = {
    ...(opts.q ? { originalName: { contains: opts.q } } : {}),
    ...(category ? { category } : {}),
    ...(opts.mimeKind
      ? { mimeType: { startsWith: opts.mimeKind === "video" ? "video/" : "image/" } }
      : {}),
  };
  const total = await prisma.mediaAsset.count({ where });
  const { totalPages, skip, take } = paginate(total, page, MEDIA_PAGE_SIZE);
  const rows = await prisma.mediaAsset.findMany({
    where,
    orderBy: { id: "desc" },
    skip,
    take,
  });
  const grouped = await prisma.mediaAsset.groupBy({ by: ["category"], _count: { _all: true } });
  const counts = Object.fromEntries(grouped.map((g) => [g.category, g._count._all]));
  return {
    page,
    totalPages,
    total,
    pageSize: MEDIA_PAGE_SIZE,
    counts,
    items: rows.map((r) => ({ ...toDto(r), createdAt: r.createdAt.toISOString() })),
  };
}

/**
 * 论坛图片站内代理(#34):按 cosKey 读内容——本地优先,
 * 缺失且配置 COS 时从 COS 回源并写穿本地缓存(下次命中本地)。
 * 返回 null=key 非法/本地与 COS 均无。
 */
export async function readMediaWithFallback(
  cosKey: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const local = await readLocalMedia(cosKey);
  if (local) return local;
  if (!isValidLocalMediaKey(cosKey)) return null;
  const storage = await resolveStorage();
  if (!storage) return null;
  try {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      storage.client.getObject(
        {
          Bucket: storage.config.bucket,
          Region: storage.config.region,
          Key: cosKey,
        },
        (err, data) => {
          if (err) reject(err);
          else resolve(Buffer.from(data.Body as Buffer));
        },
      );
    });
    if (buf.byteLength === 0) return null;
    await writeLocalMedia(cosKey, new Uint8Array(buf)).catch(() => {});
    const ext = cosKey.slice(cosKey.lastIndexOf(".")).toLowerCase();
    return { bytes: buf, mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream" };
  } catch {
    return null;
  }
}

/** COS 未配置返回 null(走本地回退);其他初始化错误仍上抛 */
async function resolveStorage(): Promise<Awaited<ReturnType<typeof getCosClient>> | null> {
  try {
    return await getCosClient();
  } catch (err) {
    if (err instanceof CosNotConfiguredError) return null;
    throw err;
  }
}

/** 删除:先删存储对象(失败则保留行可重试),再删行+审计(只记 key 不记内容) */
export async function deleteMediaAsset(id: bigint, actorUserId: bigint): Promise<void> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) throw new MediaError("NOT_FOUND", "媒体资产不存在。");
  if (isLocalMediaUrl(row.url)) {
    try {
      await deleteLocalMedia(row.cosKey);
    } catch {
      throw new MediaError("STORAGE_UNAVAILABLE", "本地存储不可用,请稍后重试。");
    }
  } else {
    const storage = await resolveStorage();
    if (!storage) {
      throw new MediaError("COS_UNAVAILABLE", "对象存储未配置,无法删除该资产。");
    }
    try {
      await storage.client.deleteObject({
        Bucket: storage.config.bucket,
        Region: storage.config.region,
        Key: row.cosKey,
      });
    } catch {
      throw new MediaError("COS_UNAVAILABLE", "对象存储暂不可用,请稍后重试。");
    }
  }
  await prisma.mediaAsset.delete({ where: { id } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_MEDIA_DELETED,
    actorUserId,
    payload: { id: id.toString(), cosKey: row.cosKey },
  });
}
