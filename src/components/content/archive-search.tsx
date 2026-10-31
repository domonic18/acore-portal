"use client";

import { usePathname } from "next/navigation";

/** 归档标题搜索(FR-209):GET 表单直达同路径 ?q=,服务端渲染可分享 */
export function ArchiveSearch() {
  const pathname = usePathname();
  return (
    <form action={pathname} className="flex gap-2">
      <input
        name="q"
        placeholder="搜索标题…"
        className="w-full rounded-lg border border-[#22385a] bg-[#0d1828] px-3.5 py-2 text-[13.5px] text-[#dcebf7] placeholder-[#6482a3] focus:border-[#5ea3cc] focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-[#6eb7df] px-4 py-2 text-[13.5px] font-semibold text-[#08131f] hover:bg-[#8ccbec]"
      >
        搜索
      </button>
    </form>
  );
}
