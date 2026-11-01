/**
 * 浏览器端上传预处理:公网测试栈 nginx 默认 client_max_body_size=1m,
 * 超过即返回 HTML 413(前端按 JSON 解析会报 Unexpected token '<')。
 * 因此大图先在 canvas 内等比缩到 ≤1920px 并转 webp(jpeg 兜底),
 * 压到 900KB 以内再上传;无法安全重编码的格式(gif/svg/pdf)原样放行。
 */

const PROXY_SAFE_BYTES = 900 * 1024;
const COMPRESSIBLE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const STEPS = [
  { maxEdge: 1920, quality: 0.85 },
  { maxEdge: 1920, quality: 0.65 },
  { maxEdge: 1280, quality: 0.7 },
  { maxEdge: 960, quality: 0.6 },
] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("图片解码失败"));
    img.src = src;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => resolve(blob && blob.type === type ? blob : null),
      type,
      quality,
    );
  });
}

function renameForType(blob: Blob, name: string): File {
  const ext = blob.type === "image/webp" ? ".webp" : ".jpg";
  const stem = name.replace(/\.[^./]+$/, "") || "image";
  return new File([blob], `${stem}${ext}`, { type: blob.type, lastModified: Date.now() });
}

async function compressImage(file: File): Promise<File | null> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    for (const step of STEPS) {
      const scale = Math.min(1, step.maxEdge / Math.max(img.width, img.height));
      const width = Math.max(1, Math.round(img.width * scale));
      const height = Math.max(1, Math.round(img.height * scale));
      if (width < 32 || height < 32) return null;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, width, height);

      const webp = await toBlob(canvas, "image/webp", step.quality);
      if (webp && webp.size <= PROXY_SAFE_BYTES) return renameForType(webp, file.name);

      // webp 不可用时转 jpeg;先铺白底避免透明区域变黑
      const opaque = document.createElement("canvas");
      opaque.width = width;
      opaque.height = height;
      const opaqueCtx = opaque.getContext("2d");
      if (opaqueCtx) {
        opaqueCtx.fillStyle = "#ffffff";
        opaqueCtx.fillRect(0, 0, width, height);
        opaqueCtx.drawImage(img, 0, 0, width, height);
        const jpeg = await toBlob(opaque, "image/jpeg", step.quality);
        if (jpeg && jpeg.size <= PROXY_SAFE_BYTES) return renameForType(jpeg, file.name);
      }
    }
    return null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareUploadFile(file: File): Promise<File> {
  if (file.size <= PROXY_SAFE_BYTES || !COMPRESSIBLE_TYPES.has(file.type)) return file;
  return (await compressImage(file)) ?? file;
}
