"use client";

import { Input, Select, Textarea } from "@/components/ui/input";
import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { FormField, FormRow } from "./field";
import { ItemPicker } from "./item-picker";
import type { ProductFieldErrors } from "./validation";
import type { ProductFormValues } from "./use-product-form";

/**
 * 基本信息区:类型 → 物品/服务选择 → 名称 / 别名 / 分类 / 描述。
 */
export function BasicSection({
  values,
  update,
  errors,
  categories,
  skuOverride,
  stack,
  onSelectItem,
  onSelectService,
  onToggleStack,
  onEnableOverride,
  onDisableOverride,
  onSkuChange,
  onUnavailable,
}: {
  values: ProductFormValues;
  update: (patch: Partial<ProductFormValues>) => void;
  errors: ProductFieldErrors;
  categories: { id: string; name: string }[];
  skuOverride: boolean;
  stack: boolean;
  onSelectItem: (entry: number, name: string | null, stackable: number | null) => void;
  onSelectService: (key: string) => void;
  onToggleStack: (next: boolean) => void;
  onEnableOverride: () => void;
  onDisableOverride: () => void;
  onSkuChange: (value: string) => void;
  onUnavailable: (unavailable: boolean) => void;
}) {
  const isGame = values.type === "game_item";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[13px] text-[#93b2ce]">商品类型</span>
        <div className="flex gap-2" role="group" aria-label="商品类型">
          {[
            { key: "game_item", label: "物品类" },
            { key: "service", label: "服务类" },
          ].map((opt) => {
            const active = values.type === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  update({ type: opt.key, sku: "", gameItemId: null, handlerKey: null });
                }}
                className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${FOCUS_RING} ${
                  active
                    ? "border-[#6fb7e0]/60 bg-[#6fb7e0]/15 font-medium text-[#a8d9f5]"
                    : "border-[#22385a] text-[#93b2ce] hover:border-[#6fb7e0]/40 hover:text-[#dcebf7]"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <ItemPicker
        type={values.type}
        sku={values.sku}
        handlerKey={values.handlerKey}
        gameItemId={values.gameItemId ?? null}
        stack={stack}
        skuOverride={skuOverride}
        errors={errors}
        onSelectItem={onSelectItem}
        onSelectService={onSelectService}
        onToggleStack={onToggleStack}
        onEnableOverride={onEnableOverride}
        onDisableOverride={onDisableOverride}
        onSkuChange={onSkuChange}
        onUnavailable={onUnavailable}
      />

      <FormRow>
        <FormField label="名称" required error={errors.name}>
          <Input
            value={values.name}
            onChange={(e) => update({ name: e.target.value })}
            aria-label="名称"
          />
        </FormField>
        <FormField
          label="别名 slug"
          required
          error={errors.slug}
          hint="前台地址 /shop/{slug};仅小写字母、数字与连字符"
        >
          <Input
            value={values.slug}
            onChange={(e) => update({ slug: e.target.value })}
            aria-label="别名 slug"
          />
        </FormField>
      </FormRow>

      <FormField label="分类" required error={errors.categoryId}>
        <Select
          value={values.categoryId}
          onChange={(e) => update({ categoryId: e.target.value })}
          aria-label="分类"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField label="描述" hint="商城列表与详情页摘要">
        <Textarea
          value={values.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={3}
          aria-label="描述"
        />
      </FormField>
    </div>
  );
}
