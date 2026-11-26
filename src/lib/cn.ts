import { twMerge } from "tailwind-merge";

/** ui 组件 className 合并唯一入口(规则 26):内建类在前、调用方类在后消解同组冲突 */
export function cn(...inputs: Array<string | false | null | undefined>) {
  return twMerge(...inputs);
}
