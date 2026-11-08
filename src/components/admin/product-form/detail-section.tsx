"use client";

import { MarkdownEditor } from "@/components/admin/markdown-editor";
import type { ProductFormValues } from "./use-product-form";

/**
 * 详情区:Markdown 正文(留空=详情页显示描述)。
 */
export function DetailSection({
  values,
  update,
}: {
  values: ProductFormValues;
  update: (patch: Partial<ProductFormValues>) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] text-[#93b2ce]">
        详情(Markdown,支持粘贴/选择图片;留空=详情页显示描述)
      </span>
      <MarkdownEditor value={values.detailMd} onChange={(v) => update({ detailMd: v })} />
    </div>
  );
}
