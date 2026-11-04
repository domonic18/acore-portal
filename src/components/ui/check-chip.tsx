"use client";

import { Check } from "lucide-react";
import { FOCUS_RING } from "./admin-tokens";

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
      className={`inline-flex cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border px-2.5 py-1 text-[12.5px] transition ${FOCUS_RING} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#6fb7e0]/60 ${
        checked
          ? "border-[#6fb7e0] bg-[#6fb7e0]/15 text-[#a8d9f5]"
          : "border-[#22385a] bg-[#0b1526] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]"
      } ${className}`}
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
