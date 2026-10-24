"use client";

import { useState } from "react";
import { ARCHIVE_CATEGORIES } from "@/constants/content";
import { SidebarCard } from "./card";

/** 站内搜索(M3 面向归档):选归档+关键词 → /{slug}?q=(归档页 T023 承接过滤) */
export function SearchBox() {
  const [slug, setSlug] = useState<string>(ARCHIVE_CATEGORIES[0].slug);
  return (
    <SidebarCard title="站内搜索">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = new FormData(e.currentTarget).get("q");
          const keyword = typeof q === "string" ? q.trim() : "";
          const target = keyword
            ? `/${slug}?q=${encodeURIComponent(keyword)}`
            : `/${slug}`;
          window.location.href = target;
        }}
      >
        <div className="flex gap-1">
          <select
            aria-label="搜索范围"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-24 rounded border border-[#243350] bg-[#0a1220] px-2 py-1.5 text-xs text-[#c7d2e0]"
          >
            {ARCHIVE_CATEGORIES.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            name="q"
            placeholder="关键词"
            className="min-w-0 flex-1 rounded border border-[#243350] bg-[#0a1220] px-2 py-1.5 text-xs text-[#e6e8eb]"
          />
          <button
            type="submit"
            className="rounded bg-[#c9a227] px-3 py-1.5 text-xs font-medium text-[#1a1408] hover:bg-[#dbb535]"
          >
            搜
          </button>
        </div>
      </form>
    </SidebarCard>
  );
}
