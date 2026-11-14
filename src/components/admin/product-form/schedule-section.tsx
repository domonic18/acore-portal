"use client";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormField, FormRow } from "./field";
import type { ProductFieldErrors } from "./validation";
import type { ProductFormValues } from "./use-product-form";
import { beijingDateTimeInput } from "@/lib/format";

const DAY_MS = 24 * 3600 * 1000;

/**
 * 售卖窗口区:促销开始 / 结束 + 快捷预设(省去手算时间的负担)。
 *
 * 时间口径:输入框是北京墙钟(与站内展示一致),提交时带 +08:00 偏移回传,
 * 服务端不依赖自身所在时区解析(见 lib/format 的 beijingDateTimeInput)。
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
    const start = Date.now();
    const end = kind === "day" ? start + DAY_MS : kind === "week" ? start + 7 * DAY_MS : start;
    update({
      saleStart: beijingDateTimeInput(new Date(start)),
      saleEnd: beijingDateTimeInput(new Date(end)),
    });
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
