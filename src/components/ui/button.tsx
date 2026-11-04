import Link from "next/link";
import { FOCUS_RING } from "./admin-tokens";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md";

const VARIANT: Record<Variant, string> = {
  primary:
    "bg-[#6fb7e0] font-semibold text-[#081120] hover:bg-[#8cc7ea] active:bg-[#5da5cf]",
  secondary:
    "border border-[#22385a] bg-[#13233a] text-[#dcebf7] hover:border-[#6fb7e0]/50 hover:text-[#a8d9f5]",
  ghost: "text-[#93b2ce] hover:bg-[#13233a] hover:text-[#dcebf7]",
  danger:
    "border border-[#eda9a9]/40 bg-[#eda9a9]/10 text-[#eda9a9] hover:bg-[#eda9a9]/20",
};

const SIZE: Record<Size, string> = {
  sm: "rounded-md px-2.5 py-1 text-xs",
  md: "rounded-lg px-3.5 py-1.5 text-[13px]",
};

const BASE = `inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

/** 后台统一按钮(primary 主操作/secondary 次要/ghost 行内/danger 破坏性) */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button {...rest} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} />
  );
}

/** 同款样式的链接按钮(卡片跳转/「查看」入口) */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  className = "",
  ...rest
}: React.ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...rest} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} />;
}
