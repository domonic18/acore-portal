"use client";

import type { ProductFormValues } from "./use-product-form";

/**
 * 商城卡片实时预览(编辑台右栏):
 * 复刻前台商城卡结构(src/app/shop/page.tsx),让运营在保存前就看到上架效果。
 */
export function StorefrontPreview({
  values,
  categoryName,
}: {
  values: ProductFormValues;
  categoryName: string;
}) {
  const image = values.images[0];
  const onSale = values.salePrice != null && values.salePrice < values.price;

  return (
    <div className="flex flex-col gap-3">
      <span className="text-[13px] text-[#93b2ce]">商城卡片预览</span>
      <div className="rounded-lg border border-[#22385a] bg-[#0b1526] p-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={values.name || "商品主图"}
            draggable={false}
            className="flex h-32 w-full items-center justify-center rounded bg-gradient-to-br from-indigo-950 to-gray-900 object-contain p-1"
          />
        ) : (
          <div
            aria-hidden
            className="flex h-32 items-center justify-center rounded bg-gradient-to-br from-indigo-950 to-gray-900 text-4xl"
          >
            {values.type === "game_item" ? "⚔" : "🛠"}
          </div>
        )}
        <span className="mt-2 block font-semibold text-[#dcebf7]">
          {values.name || "(未命名商品)"}
        </span>
        <span className="block text-xs text-[#6482a3]">{categoryName || "未选择分类"}</span>
        <span className="mt-1 flex items-baseline gap-2">
          <span className="text-lg font-bold text-amber-400">
            {onSale ? values.salePrice : values.price}
          </span>
          {onSale && <span className="text-sm text-[#6482a3] line-through">{values.price}</span>}
        </span>
      </div>
      <p className="text-xs text-[#6482a3]">
        {values.status === "published" ? "状态:已发布" : "状态:草稿(前台不可见)"}
        {values.listed ? "" : " · 目录已隐藏"}
        {values.featured ? " · 首页精选" : ""}
      </p>
    </div>
  );
}
