import { twMerge } from "tailwind-merge";
import { FOCUS_RING } from "./admin-tokens";

const FIELD = `w-full rounded-lg border border-[#22385a] bg-[#0b1526] px-3 py-1.5 text-[13px] text-[#dcebf7] placeholder:text-[#6482a3] transition hover:border-[#3a587e] disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING}`;

/** 后台统一文本输入(text/number/password 等原生 type 经 props 透传) */
export function Input({
  className = "",
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={twMerge(FIELD, className)} />;
}

/** 后台统一多行输入 */
export function Textarea({
  className = "",
  ...rest
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={twMerge(`${FIELD} leading-6`, className)} />;
}
