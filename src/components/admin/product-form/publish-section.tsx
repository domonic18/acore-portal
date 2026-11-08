"use client";

import { Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField } from "./field";
import type { ProductFormValues } from "./use-product-form";

/**
 * 展示与排序区:状态 / 目录可见 / 首页精选。
 */
export function PublishSection({
  values,
  update,
}: {
  values: ProductFormValues;
  update: (patch: Partial<ProductFormValues>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormField label="状态">
        <Select
          value={values.status}
          onChange={(e) => update({ status: e.target.value })}
          aria-label="状态"
          className="w-auto"
        >
          <option value="draft">草稿(前台不可见)</option>
          <option value="published">已发布</option>
        </Select>
      </FormField>
      <div className="flex flex-col gap-3">
        <label className="flex items-center gap-2 text-[13px] text-[#93b2ce]">
          <Switch
            checked={values.listed}
            onChange={(v) => update({ listed: v })}
            ariaLabel="目录可见"
          />
          <span>目录可见(前台商城列表展示)</span>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-[#93b2ce]">
          <Switch
            checked={values.featured}
            onChange={(v) => update({ featured: v })}
            ariaLabel="精选"
          />
          <span>首页精选</span>
        </label>
      </div>
    </div>
  );
}
