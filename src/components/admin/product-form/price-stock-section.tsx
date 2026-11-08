"use client";

import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { FormField, FormRow } from "./field";
import type { ProductFieldErrors } from "./validation";
import type { ProductFormValues } from "./use-product-form";

/**
 * 价格与库存区:原价 / 促销价 / 库存开关 / 库存 / 低库存阈值 / 每人限购。
 */
export function PriceStockSection({
  values,
  update,
  errors,
}: {
  values: ProductFormValues;
  update: (patch: Partial<ProductFormValues>) => void;
  errors: ProductFieldErrors;
}) {
  const isService = values.type === "service";

  return (
    <div className="flex flex-col gap-4">
      <FormRow>
        <FormField label="原价(积分)" required error={errors.price}>
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={values.price}
            onChange={(e) => update({ price: Number(e.target.value) || 0 })}
            aria-label="原价(积分)"
          />
        </FormField>
        <FormField
          label="促销价(留空=无促销)"
          error={errors.salePrice}
          hint="促销价必须低于原价"
        >
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            value={values.salePrice ?? ""}
            onChange={(e) =>
              update({ salePrice: e.target.value === "" ? null : Number(e.target.value) || 0 })
            }
            aria-label="促销价(留空=无促销)"
          />
        </FormField>
      </FormRow>

      {isService ? (
        <p className="text-xs text-[#6482a3]">服务类商品不使用库存字段(发货由处理器即时完成)。</p>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex items-center gap-2 text-[13px] text-[#93b2ce]">
            <Switch
              checked={values.stockEnabled}
              onChange={(v) => update({ stockEnabled: v })}
              ariaLabel="启用库存管理"
            />
            <span>启用库存管理</span>
          </label>
          {values.stockEnabled && (
            <FormRow>
              <FormField label="库存" error={errors.stock}>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={values.stock ?? 0}
                  onChange={(e) => update({ stock: Number(e.target.value) || 0 })}
                  aria-label="库存"
                />
              </FormField>
              <FormField label="低库存阈值" error={errors.lowStockThreshold}>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={values.lowStockThreshold ?? 1}
                  onChange={(e) =>
                    update({ lowStockThreshold: Number(e.target.value) || 0 })
                  }
                  aria-label="低库存阈值"
                />
              </FormField>
            </FormRow>
          )}
        </div>
      )}

      <FormField
        label="每人限购(留空=不限购)"
        error={errors.maxPerUser}
        hint={
          isService
            ? "服务类固定限购 1 件:发货完成后释放额度,可再次购买(如改名后再改一次)"
            : "按用户累计已购件数(不含已取消/退款单)"
        }
      >
        <Input
          type="number"
          min={1}
          inputMode="numeric"
          value={isService ? 1 : (values.maxPerUser ?? "")}
          disabled={isService}
          onChange={(e) =>
            update({
              maxPerUser:
                e.target.value === "" ? null : Math.max(1, Math.floor(Number(e.target.value) || 1)),
            })
          }
          aria-label="每人限购(留空=不限购)"
          className="w-32"
        />
      </FormField>
    </div>
  );
}
