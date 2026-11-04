"use client";

import { FOCUS_RING } from "./admin-tokens";

/** 后台开关(role="switch",受控;disabled 时只读不降透明度提示) */
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
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children" | "onClick" | "onChange" | "disabled" | "aria-label" | "type">) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      {...rest}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50 ${
        checked
          ? "border-[#6fb7e0]/60 bg-[#6fb7e0]/30"
          : "border-[#22385a] bg-[#0b1526]"
      } ${FOCUS_RING} ${className}`}
    >
      <span
        aria-hidden="true"
        className={`absolute h-3.5 w-3.5 rounded-full transition-all ${
          checked ? "left-[18px] bg-[#a8d9f5]" : "left-[3px] bg-[#6482a3]"
        }`}
      />
    </button>
  );
}
