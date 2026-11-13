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

/** 后台统一下拉(原生 select,option 继承深色) */
export function Select({
  className = "",
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={twMerge(
        `${FIELD} appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%2212%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%236482a3%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[position:right_0.6rem_center] bg-no-repeat pr-8`,
        className,
      )}
    />
  );
}
