/**
 * 论坛文字颜色受限色板(T-编辑器升级):
 * Markdown 无颜色语法、sanitize 全局剥 style ⇒ 颜色用 <span class="c-{key}">
 * 类标记表达。三处协同以本常量为单源:
 * ① 工具栏色板子菜单(components/forum/vditor-editor.tsx 派生);
 * ② 渲染白名单(lib/markdown.ts sanitize 的 span className 正则);
 * ③ globals.css 双作用域配色(.forum-post-body/.vditor-reset 下的 .c-{key})。
 * 扩色 = 三处同步(AGENTS 规则 22),禁止放开口子接受任意类名/内联样式。
 */
export const FORUM_TEXT_PALETTE = [
  { key: "red", label: "红", color: "#f87171" },
  { key: "orange", label: "橙", color: "#fb923c" },
  { key: "gold", label: "黄", color: "#facc15" },
  { key: "green", label: "绿", color: "#4ade80" },
  { key: "blue", label: "蓝", color: "#60a5fa" },
  { key: "purple", label: "紫", color: "#c084fc" },
] as const;

export type ForumPaletteKey = (typeof FORUM_TEXT_PALETTE)[number]["key"];

/** 渲染白名单:仅放行本色板的 c-{key} 类(与 hljs 高亮类共用 span 白名单位) */
export const FORUM_PALETTE_CLASS_RE = new RegExp(
  `^c-(${FORUM_TEXT_PALETTE.map((c) => c.key).join("|")})$`,
);

export const forumPaletteClass = (key: ForumPaletteKey) => `c-${key}`;

/** 工具栏色块图标(实心圆角方块,自带颜色便于直观选取) */
export const forumPaletteSwatchIcon = (color: string) =>
  `<svg viewBox="0 0 24 24" width="16" height="16"><rect x="4" y="4" width="16" height="16" rx="4" fill="${color}"/></svg>`;
