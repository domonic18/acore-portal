import { NextResponse } from "next/server";
import { readLocalMedia } from "@/lib/media/local-store";
import { readMediaWithFallback } from "@/server/services/media/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 站内媒体读取(#34 2026-11-04 起论坛图片统一走此路径):本地读取优先,
 * 缺失且配置 COS 时回源并写穿本地缓存(下次命中本地)。
 * key 由 local-store 严格校验,防目录穿越;hash 寻址内容不可变 → 一年
 * 强缓存;nosniff + sandbox 阻断同源脚本执行。
 */
export async function GET(
  _req: Request,
  { params }: { params: { key: string[] } },
) {
  const key = (params.key ?? []).join("/");
  const file = (await readLocalMedia(key)) ?? (await readMediaWithFallback(key));
  if (!file) return new NextResponse("Not Found", { status: 404 });
  return new NextResponse(new Uint8Array(file.bytes), {
    headers: {
      "content-type": file.mimeType,
      "content-length": String(file.bytes.byteLength),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
