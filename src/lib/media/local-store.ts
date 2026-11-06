import "server-only";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * 本地媒体存储(未配置 COS 时的回退):与 cosKey 同形落 workspace/uploads,
 * 对外 URL = /uploads/{cosKey},由 app/uploads/[...key] 路由读取。
 * 内容按 sha256 寻址,同 key 内容恒定,故可长缓存。
 */

const KEY_PATTERN = /^media\/\d{8}\/[0-9a-f]{64}(?:\.[a-z0-9]{1,8})?$/;

export const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  // 视频:本地回退按扩展名还原 content-type,错类型 + nosniff 会被浏览器拒绝播放
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

export const LOCAL_MEDIA_URL_PREFIX = "/uploads/";

export function localMediaRoot(): string {
  return path.join(process.cwd(), "workspace", "uploads");
}

export function isValidLocalMediaKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

export function isLocalMediaUrl(url: string): boolean {
  return url.startsWith(LOCAL_MEDIA_URL_PREFIX);
}

export function localMediaUrl(key: string): string {
  return `${LOCAL_MEDIA_URL_PREFIX}${key}`;
}

function resolveKeyPath(key: string): string {
  if (!isValidLocalMediaKey(key)) throw new Error(`invalid local media key: ${key}`);
  return path.join(localMediaRoot(), key);
}

export async function writeLocalMedia(key: string, bytes: Uint8Array): Promise<void> {
  const file = resolveKeyPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function readLocalMedia(
  key: string,
): Promise<{ bytes: Buffer; mimeType: string } | null> {
  if (!isValidLocalMediaKey(key)) return null;
  try {
    const bytes = await readFile(resolveKeyPath(key));
    const ext = path.extname(key).toLowerCase();
    return { bytes, mimeType: MIME_BY_EXT[ext] ?? "application/octet-stream" };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

export async function deleteLocalMedia(key: string): Promise<void> {
  try {
    await unlink(resolveKeyPath(key));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return;
    throw err;
  }
}
