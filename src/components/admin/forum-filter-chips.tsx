"use client";

import { FilterChipToggle } from "@/components/ui/filter-chip";

/**
 * 论坛筛选 chip(仅置顶/仅加精/回收站):勾选即提交所在 GET 表单;
 * 隐藏 checkbox 带 name/value 参与提交,文案与原 checkbox 一致(E2E getByLabel 依赖)。
 *
 * 状态维度不设 chip:「状态标签」下拉已是状态的唯一出口(含「已关闭」),
 * 再加「仅已关闭」chip 就是同一集合的两个入口,反而让两处口径漂移。
 */
export function ForumFilterChips({
  pinned,
  featured,
  deleted,
}: {
  pinned: boolean;
  featured: boolean;
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
        checked={featured}
        name="featured"
        value="1"
        onChange={(_next, event) => event.currentTarget.closest("form")?.requestSubmit()}
      >
        仅加精
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
