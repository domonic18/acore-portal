/**
 * 后台设计令牌(深色控制台,class 级复用):
 * 仅 class 常量,不引组件(constants 不落 UI;此文件属 components/ui)。
 * 语义类映射 [data-admin-scope] 作用域下的 shadcn 语义变量(见 globals.css),
 * 值与旧 hex 等价(#0b1526/#13233a/#22385a/#6fb7e0),调用方零改动。
 * 统一焦点规范:所有可交互控件追加 FOCUS_RING,键盘可见。
 */
export const ADMIN_SURFACE = "bg-background";
export const ADMIN_CARD = "bg-card";
export const ADMIN_BORDER = "border-border";

/** 统一键盘焦点环(替代散落的 focus: outline) */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background";
