import Link from "next/link";
import { Check } from "lucide-react";
import { FOCUS_RING } from "./admin-tokens";

const CHIP = `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] transition select-none`;
const ACTIVE = "border-[#6fb7e0] bg-[#6fb7e0]/15 font-medium text-[#a8d9f5]";
const INACTIVE = "border-[#22385a] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]";

function ChipInner({
  icon,
  active,
  children,
}: {
  icon?: React.ReactNode;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <>
      {active ? (
        <Check aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      ) : (
        icon && <span className="shrink-0 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {children}
    </>
  );
}

/** 筛选 chip(链接版,RSC 可用):筛选态一目了然(选中打勾+高亮),替代裸文字链接 */
export function FilterChip({
  href,
  active,
  icon,
  children,
  className = "",
}: {
  href: string;
  active: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-pressed={active}
      className={`${CHIP} ${active ? ACTIVE : INACTIVE} ${FOCUS_RING} ${className}`}
    >
      <ChipInner icon={icon} active={active}>
        {children}
      </ChipInner>
    </Link>
  );
}

/**
 * 筛选 chip(表单版,client):隐藏 checkbox 保持 label 语义(getByLabel 可命中),
 * 视觉即行业常见的可切换胶囊;name/value 可选透传参与 GET/POST 提交;
 * onChange 附带原始事件,便于调用方就近 requestSubmit。
 */
export function FilterChipToggle({
  checked,
  onChange,
  icon,
  children,
  name,
  value,
  className = "",
}: {
  checked: boolean;
  onChange: (next: boolean, event: React.ChangeEvent<HTMLInputElement>) => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  name?: string;
  value?: string;
  className?: string;
}) {
  return (
    <label
      className={`${CHIP} cursor-pointer ${checked ? ACTIVE : INACTIVE} ${FOCUS_RING} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#6fb7e0]/60 ${className}`}
    >
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={(e) => onChange(e.target.checked, e)}
        className="sr-only"
      />
      <ChipInner icon={icon} active={checked}>
        {children}
      </ChipInner>
    </label>
  );
}
