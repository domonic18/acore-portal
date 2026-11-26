"use client";

import { Check } from "lucide-react";
import { FOCUS_RING } from "./admin-tokens";
import { cn } from "@/lib/cn";

/**
 * 勾选 chip(表单内多选项,如文章标签/页内开关项):
 * 隐藏 checkbox 保 label 语义(getByLabel 可命中),选中态打勾+高亮,
 * 与 FilterChipToggle 同视觉语言。
 */
export function CheckChip({
  checked,
  onChange,
  children,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-[12.5px] transition",
        FOCUS_RING,
        "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/60",
        checked
          ? "border-primary bg-primary/15 text-primary-bright"
          : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      {checked && <Check aria-hidden="true" className="h-3.5 w-3.5" />}
      {children}
    </label>
  );
}
