import { cn } from "@/lib/cn";
import { FOCUS_RING } from "./admin-tokens";

const FIELD = `w-full rounded-lg border border-border bg-background px-3 py-1.5 text-[13px] text-foreground placeholder:text-faint-foreground transition hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

/** 后台统一文本输入(text/number/password 等原生 type 经 props 透传) */
export function Input({
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={cn(FIELD, className)} />;
}

/** 后台统一多行输入 */
export function Textarea({
  className,
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={cn(FIELD, "leading-6", className)} />;
}
