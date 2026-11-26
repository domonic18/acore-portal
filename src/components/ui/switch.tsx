"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/cn";

/**
 * 后台开关(Radix Switch,受控;a11y/焦点管理内置):
 * 保持既有受控 API(checked/onChange/ariaLabel),10 个消费者零改动。
 * 视觉规范化(2026-11-26 设计稿):选中态 accent 实底 + 白滑块(原 accent/30 底 + 浅蓝滑块)。
 */
export function Switch({
  checked,
  onChange,
  disabled = false,
  ariaLabel,
  className = "",
  ...rest
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
} & Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "className" | "children" | "onClick" | "onChange" | "disabled" | "aria-label" | "type" | "checked"
>) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
      {...rest}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "border-transparent bg-accent" : "border-border bg-background",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block size-3.5 rounded-full transition-transform",
          checked ? "translate-x-[17px] bg-white" : "translate-x-[3px] bg-muted",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
