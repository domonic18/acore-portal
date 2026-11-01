import { NextResponse } from "next/server";
import { readLocalMedia } from "@/lib/media/local-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 本地媒体读取(未配置 COS 的上传回退):next start 只服务构建期 public,
 * 运行期新增文件必须经此路由读取。key 由 local-store 严格校验,防目录穿越。
 * hash 寻址内容不可变 → 一年强缓存;nosniff + sandbox 阻断同源脚本执行。
 */
export async function GET(
  _req: Request,
  { params }: { params: { key: string[] } },
) {
  const key = (params.key ?? []).join("/");
  const file = await readLocalMedia(key);
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
