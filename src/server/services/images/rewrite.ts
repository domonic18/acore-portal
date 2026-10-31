import "server-only";
import { prisma } from "@/lib/db";

/**
 * 富文本旧图片 URL 重写(T061;FR-132;data-model §2.8):
 * WP 存量正文/图集里的 /wp-content/uploads/ 引用,经 image_asset_map 映射表
 * 批量重写为 COS/CDN 地址;未命中映射的旧引用回退本地占位图,保证不白屏
 * (T063 演练死链扫描应保证命中,占位只是渲染层兜底)。
 */

export const LEGACY_UPLOADS_PREFIX = "/wp-content/uploads/";

// 本地静态占位图(灰底放大镜,60 字节级);public/images/legacy-missing.svg
export const PLACEHOLDER_IMAGE = "/images/legacy-missing.svg";

// 绝对(任意 host)与相对两种形态;URL 里不再吃引号/空白/标签边界字符
const LEGACY_URL_RE =
  /https?:\/\/[^"'\s>]+\/wp-content\/uploads\/[^"'\s>)]+|\/wp-content\/uploads\/[^"'\s>)]+/g;

/** 归一化:去 scheme+host,保留路径+查询串(与 cos-upload 的 oldUrl 口径一致) */
function normalize(raw: string): string {
  return raw.replace(/^https?:\/\/[^/]+/, "");
}

export async function rewriteLegacyImageUrls(html: string): Promise<string> {
  const raws = html.match(LEGACY_URL_RE);
  if (!raws || raws.length === 0) return html;

  const normalized = [...new Set(raws.map(normalize))];
  const rows = await prisma.imageAssetMap.findMany({
    where: { oldUrl: { in: normalized } },
    select: { oldUrl: true, newUrl: true },
  });
  const map = new Map(rows.map((r) => [r.oldUrl, r.newUrl]));

  // 单趟替换:命中→newUrl;未命中→占位。替换后输出不再含旧前缀,重入幂等
  return html.replace(LEGACY_URL_RE, (raw) => map.get(normalize(raw)) ?? PLACEHOLDER_IMAGE);
}
