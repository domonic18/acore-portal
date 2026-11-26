"use client";

import Link from "next/link";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/cn";

/** 后台统一按钮(primary 主操作/secondary 次要/ghost 行内/danger 破坏性)。
 * 语义变体走 shadcn 语义令牌(2026-11-26 设计稿):admin 作用域呈深色控制台配色,
 * 站点侧随 --theme-* 主题(primary=TBC 金 / WLK 冰蓝)。 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control font-medium transition disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  {
    variants: {
      variant: {
        primary: "bg-primary font-semibold text-primary-foreground hover:bg-primary/90",
        secondary:
          "border border-border bg-secondary text-secondary-foreground hover:border-ring/50 hover:text-accent",
        ghost: "text-muted hover:bg-secondary hover:text-secondary-foreground",
        danger: "border border-danger/40 bg-danger/10 text-danger hover:bg-danger/20",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        md: "h-9 px-4 text-[13px]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonVariant = NonNullable<
  React.ComponentProps<typeof Button>["variant"]
>;

function Button({
  variant,
  size,
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return <button {...rest} className={cn(buttonVariants({ variant, size }), className)} />;
}

/** 同款样式的链接按钮(卡片跳转/「查看」入口) */
function ButtonLink({
  variant,
  size,
  className,
  ...rest
}: React.ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
}) {
  return <Link {...rest} className={cn(buttonVariants({ variant, size }), className)} />;
}

export { Button, ButtonLink, buttonVariants };
