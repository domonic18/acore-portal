"use client";

import { FilterChipToggle } from "@/components/ui/filter-chip";

/**
 * 论坛筛选 chip(仅置顶/仅已关闭/回收站):勾选即提交所在 GET 表单;
 * 隐藏 checkbox 带 name/value 参与提交,文案与原 checkbox 一致(E2E getByLabel 依赖)。
 */
export function ForumFilterChips({
  pinned,
  closed,
  deleted,
}: {
  pinned: boolean;
  closed: boolean;
  deleted: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <FilterChipToggle
        checked={pinned}
        name="pinned"
        value="1"
        onChange={(_next, event) => event.currentTarget.closest("form")?.requestSubmit()}
      >
        仅置顶
      </FilterChipToggle>
      <FilterChipToggle
        checked={closed}
        name="closed"
        value="1"
        onChange={(_next, event) => event.currentTarget.closest("form")?.requestSubmit()}
      >
        仅已关闭
      </FilterChipToggle>
      <FilterChipToggle
        checked={deleted}
        name="deleted"
        value="1"
        onChange={(_next, event) => event.currentTarget.closest("form")?.requestSubmit()}
      >
        回收站(已删)
      </FilterChipToggle>
    </div>
  );
}
