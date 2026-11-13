// 拷贝 vditor 运行时静态资产到 public/(编辑器实例配 cdn:'/vditor' 从本站加载,
// 禁 unpkg 默认源——国内不可达)。只拷白名单子集:Lute/高亮/i18n/图标/主题 CSS/
// 表情图;mathjax/mermaid 等懒加载渲染器论坛管线不消费,不进镜像(约省 17MB)。
import { cpSync, existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = join(ROOT, "node_modules", "vditor", "dist");
// vditor 运行时按 ${cdn}/dist/... 取资产,cdn:'/vditor' ⇒ 落 public/vditor/dist
const DEST = join(ROOT, "public", "vditor", "dist");
const SUBDIRS = ["css", "images", "js/lute", "js/i18n", "js/icons", "js/highlight.js"];

if (!existsSync(SRC)) {
  console.error(`[copy-vditor-assets] 源不存在: ${SRC}(请先 pnpm install)`);
  process.exit(1);
}
rmSync(DEST, { recursive: true, force: true });
for (const sub of SUBDIRS) {
  const from = join(SRC, sub);
  if (!existsSync(from)) {
    console.error(`[copy-vditor-assets] 缺失资产目录: ${from}(vditor 升级后布局有变,请核对)`);
    process.exit(1);
  }
  cpSync(from, join(DEST, sub), { recursive: true });
}
console.log(`[copy-vditor-assets] vditor/dist 白名单子集 -> public/vditor/dist/ (${SUBDIRS.length} 项)`);
