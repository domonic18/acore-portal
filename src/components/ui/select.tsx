"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/cn";

/**
 * 后台统一下拉(兼容层):对外保持原生 select 的 props 形态
 * (value/onChange(e.target.value)/children=<option>),内部渲染 Radix Select,
 * 消费面无需改动。迁移自 ui/input.tsx 的原生版本(2026-11-26 shadcn/ui 迁移)。
 *
 * 契约:
 * - onChange 收到合成事件,仅保证 target.value / target.name 两个读取面
 * - <option value="">是真实可选项(顶级分类/未绑定等),经哨兵值双向映射
 *   (Radix Item 禁止空值);data-* 与 aria-* 透传到触发器,供测试/可访问定位
 * - name 仅用于表单提交兼容(sr-only 原生 select;后台表单均为受控 state,少用)
 */

/** Radix Item 禁止 value="",空值选项经此哨兵流转 */
const EMPTY = "__empty__";

type OptionMeta = {
  value: string;
  label: string;
  disabled: boolean;
};

function optionText(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (React.isValidElement(node)) return optionText(node.props.children);
  if (Array.isArray(node)) return node.map(optionText).join("");
  return "";
}

function collectOptions(children: React.ReactNode): OptionMeta[] {
  const out: OptionMeta[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child) || child.type !== "option") return;
    const props = child.props as {
      value?: string | number | readonly string[];
      disabled?: boolean;
      children?: React.ReactNode;
    };
    const raw = props.value === undefined ? optionText(props.children) : String(props.value);
    out.push({ value: raw, label: optionText(props.children), disabled: Boolean(props.disabled) });
  });
  return out;
}

const toRadix = (value: string) => (value === "" ? EMPTY : value);
const fromRadix = (value: string) => (value === EMPTY ? "" : value);

type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "multiple" | "size" | "children"
> & {
  children: React.ReactNode;
  onChange?: (event: React.ChangeEvent<HTMLSelectElement>) => void;
};

export function Select({
  className = "",
  children,
  value,
  defaultValue,
  onChange,
  disabled = false,
  name,
  id,
  ...rest
}: SelectProps) {
  const options = React.useMemo(() => collectOptions(children), [children]);
  // 内部镜像状态:非受控用法(无 value/onChange,常见于 GET 筛选表单)也要让
  // sr-only 提交用 select 跟随点选,否则表单提交的是 defaultValue 而非当前选择
  const [inner, setInner] = React.useState(() =>
    defaultValue === undefined ? "" : String(defaultValue),
  );
  const isControlled = value !== undefined;
  const radixValue = isControlled ? toRadix(String(value)) : toRadix(inner);

  const handleValueChange = (next: string) => {
    setInner(fromRadix(next));
    onChange?.({
      target: { value: fromRadix(next), name },
    } as React.ChangeEvent<HTMLSelectElement>);
  };

  return (
    <>
      <SelectPrimitive.Root
        value={radixValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectPrimitive.Trigger
          id={id}
          {...(rest as unknown as React.ComponentProps<typeof SelectPrimitive.Trigger>)}
          className={cn(
            "flex w-full min-w-0 items-center justify-between gap-2 rounded-control border border-border bg-background px-3 py-1.5 text-left text-[13px] text-foreground transition hover:border-line-strong disabled:cursor-not-allowed disabled:opacity-50",
            "data-[state=open]:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60",
            "[&>span]:min-w-0 [&>span]:truncate",
            className,
          )}
        >
          <SelectPrimitive.Value />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="size-3.5 shrink-0 text-muted" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className={cn(
              "z-50 max-h-96 overflow-hidden rounded-overlay border border-line-strong bg-popover p-1.5 text-[13px] text-foreground shadow-pop",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            )}
          >
            <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-muted">
              <ChevronUp className="size-3.5" />
            </SelectPrimitive.ScrollUpButton>
            <SelectPrimitive.Viewport className="w-full min-w-[var(--radix-select-trigger-width)]">
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={toRadix(option.value)}
                  disabled={option.disabled}
                  data-value={option.value}
                  className={cn(
                    "flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-panel data-[highlighted]:text-heading data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                  )}
                >
                  <SelectPrimitive.ItemIndicator asChild>
                    <span className="flex w-4 shrink-0 items-center justify-center text-accent">
                      <Check className="size-3.5" />
                    </span>
                  </SelectPrimitive.ItemIndicator>
                  <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
            <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-muted">
              <ChevronDown className="size-3.5" />
            </SelectPrimitive.ScrollDownButton>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {name !== undefined && (
        <select
          aria-hidden="true"
          tabIndex={-1}
          name={name}
          value={isControlled ? String(value) : inner}
          onChange={() => {}}
          disabled={disabled}
          className="sr-only"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </>
  );
}
