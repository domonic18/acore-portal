import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { getCosClient } from "@/lib/cos/client";

/**
 * 媒体库最小集(R13/FR-217,api-admin-m3 媒体节):
 * 白名单 image/*+pdf,单文件 ≤10MB;cosKey=media/{yyyyMMdd}/{sha256}{ext} 按 hash
 * 幂等(同内容复用资产行,零重复上传);url=cdnBase+cosKey 入库免拼装;
 * 删除=删 COS 对象+删行(不追踪引用,死链风险由路由层 warning 二次确认口径)。
 */

export const MEDIA_MAX_BYTES = 10 * 1024 * 1024;

export class MediaError extends Error {
  constructor(
    public code: "TYPE_REJECTED" | "TOO_LARGE" | "NOT_FOUND" | "COS_UNAVAILABLE",
    message?: string,
  ) {
    super(message ?? `media_error: ${code}`);
    this.name = "MediaError";
  }
}

export type MediaUploadInput = {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type MediaAssetDto = {
  id: string;
  cosKey: string;
  url: string;
  originalName: string;
  sizeBytes: number;
  mimeType: string;
};

function isAllowedMime(mime: string): boolean {
  return mime.startsWith("image/") || mime === "application/pdf";
}

function safeExt(name: string, mime: string): string {
  const raw = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  if (/^\.[a-z0-9]{1,8}$/i.test(raw)) return raw.toLowerCase();
  return mime === "application/pdf" ? ".pdf" : ".bin";
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
    if (f.bytes.byteLength > MEDIA_MAX_BYTES) {
      throw new MediaError("TOO_LARGE", `单文件不得超过 10MB:${f.name}`);
    }
  }
  const { client, config } = await getCosClient();
  const out: MediaAssetDto[] = [];
  for (const f of files) {
    const sha256 = createHash("sha256").update(f.bytes).digest("hex");
    const cosKey = `media/${dateSegment()}/${sha256}${safeExt(f.name, f.mimeType)}`;
    const existing = await prisma.mediaAsset.findUnique({ where: { cosKey } });
    if (existing) {
      out.push(toDto(existing));
      continue;
    }
    try {
      await client.putObject({
        Bucket: config.bucket,
        Region: config.region,
        Key: cosKey,
        Body: Buffer.from(f.bytes),
        ContentType: f.mimeType,
      });
    } catch {
      throw new MediaError("COS_UNAVAILABLE", "对象存储暂不可用,请稍后重试。");
    }
    const url = `${config.cdnBase.replace(/\/?$/, "")}/${cosKey}`;
    const row = await prisma.mediaAsset.create({
      data: {
        cosKey,
        url,
        originalName: f.name,
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
  sizeBytes: number;
  mimeType: string;
}): MediaAssetDto {
  return {
    id: row.id.toString(),
    cosKey: row.cosKey,
    url: row.url,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    mimeType: row.mimeType,
  };
}

export const MEDIA_PAGE_SIZE = 20;

export async function listMediaAssets(opts: { page?: number; q?: string }): Promise<{
  items: Array<MediaAssetDto & { createdAt: string }>;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const where = opts.q ? { originalName: { contains: opts.q } } : {};
  const total = await prisma.mediaAsset.count({ where });
  const rows = await prisma.mediaAsset.findMany({
    where,
    orderBy: { id: "desc" },
    skip: (page - 1) * MEDIA_PAGE_SIZE,
    take: MEDIA_PAGE_SIZE,
  });
  return {
    page,
    totalPages: Math.max(1, Math.ceil(total / MEDIA_PAGE_SIZE)),
    total,
    pageSize: MEDIA_PAGE_SIZE,
    items: rows.map((r) => ({ ...toDto(r), createdAt: r.createdAt.toISOString() })),
  };
}

/** 删除:先删 COS 对象(失败则保留行可重试),再删行+审计(只记 key 不记内容) */
export async function deleteMediaAsset(id: bigint, actorUserId: bigint): Promise<void> {
  const row = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!row) throw new MediaError("NOT_FOUND", "媒体资产不存在。");
  const { client, config } = await getCosClient();
  try {
    await client.deleteObject({ Bucket: config.bucket, Region: config.region, Key: row.cosKey });
  } catch {
    throw new MediaError("COS_UNAVAILABLE", "对象存储暂不可用,请稍后重试。");
  }
  await prisma.mediaAsset.delete({ where: { id } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_MEDIA_DELETED,
    actorUserId,
    payload: { id: id.toString(), cosKey: row.cosKey },
  });
}
