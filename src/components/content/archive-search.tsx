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
        className="w-full rounded-lg border border-line bg-panel-inset px-3.5 py-2 text-[13.5px] text-heading placeholder-muted focus:border-accent focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-lg bg-link px-4 py-2 text-[13.5px] font-semibold text-ink hover:bg-link-hover"
      >
        搜索
      </button>
    </form>
  );
}
