"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormRow } from "./field";
import type { ProductFieldErrors } from "./validation";
import type { ProductFormValues } from "./use-product-form";

/** 本地时区的 datetime-local 值格式(不带时区后缀) */
function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 售卖窗口区:促销开始 / 结束 + 快捷预设(省去手算时间的负担)。
 */
export function ScheduleSection({
  values,
  update,
  errors,
}: {
  values: ProductFormValues;
  update: (patch: Partial<ProductFormValues>) => void;
  errors: ProductFieldErrors;
}) {
  function preset(kind: "now" | "day" | "week" | "none") {
    if (kind === "none") {
      update({ saleStart: null, saleEnd: null });
      return;
    }
    const start = new Date();
    const end = new Date(start);
    if (kind === "day") end.setDate(end.getDate() + 1);
    if (kind === "week") end.setDate(end.getDate() + 7);
    update({ saleStart: toLocalInput(start), saleEnd: toLocalInput(end) });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormRow>
        <FormField label="促销开始(留空=无限制)">
          <Input
            type="datetime-local"
            value={values.saleStart ?? ""}
            onChange={(e) => update({ saleStart: e.target.value || null })}
            aria-label="促销开始(留空=无限制)"
          />
        </FormField>
        <FormField label="促销结束(留空=无限制)" error={errors.saleEnd}>
          <Input
            type="datetime-local"
            value={values.saleEnd ?? ""}
            onChange={(e) => update({ saleEnd: e.target.value || null })}
            aria-label="促销结束(留空=无限制)"
          />
        </FormField>
      </FormRow>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => preset("now")}>
          立即开始
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset("day")}>
          24 小时
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset("week")}>
          一周
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => preset("none")}>
          不限时间
        </Button>
      </div>
    </div>
  );
}
