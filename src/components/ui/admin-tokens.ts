/**
 * 后台设计令牌(ardot p12 深色控制台色板,class 级复用):
 * 仅 class 常量,不引组件(constants 不落 UI;此文件属 components/ui)。
 * 统一焦点规范:所有可交互控件追加 FOCUS_RING,键盘可见。
 */
export const ADMIN_SURFACE = "bg-[#0b1526]";
export const ADMIN_CARD = "bg-[#13233a]";
export const ADMIN_BORDER = "border-[#22385a]";

/** 统一键盘焦点环(替代散落的 focus: outline) */
export const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6fb7e0]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1526]";
