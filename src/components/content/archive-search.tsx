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
        className="w-full rounded border border-[#243350] bg-[#0d1728] px-3 py-1.5 text-sm text-[#c7d2e0] placeholder-[#5d6b80] focus:border-[#c9a227] focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-[#c9a227] px-3 py-1.5 text-sm font-medium text-[#1a1408] hover:bg-[#dbb535]"
      >
        搜索
      </button>
    </form>
  );
}
