"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BasicSection } from "./basic-section";
import { DetailSection } from "./detail-section";
import { ProductImagePanel } from "./image-panel";
import { PriceStockSection } from "./price-stock-section";
import { PublishSection } from "./publish-section";
import { ScheduleSection } from "./schedule-section";
import { StorefrontPreview } from "./storefront-preview";
import { useProductForm, type ProductFormValues } from "./use-product-form";

export type { ProductFormValues };

/**
 * 商品新建/编辑台(两栏布局):
 * 主列 = 分组卡片(基本信息 / 价格与库存 / 售卖窗口 / 展示与排序 / 详情);
 * 右栏 = 商品图片面板 + 商城卡片实时预览;
 * 底部吸底保存条 = 唯一「保存」按钮 + 未保存提示 + 保存结果。
 *
 * SKU 与游戏物品的绑定由服务端交叉校验(发货只看 SKU,打错数字会发错物品),
 * 界面侧由物品选择器自动派生 SKU。
 */
export function ProductForm({
  initial,
  categories,
}: {
  initial?: ProductFormValues;
  categories: { id: string; name: string }[];
}) {
  const form = useProductForm({ initial, categories });
  const { values, update, errors, dirty, busy, saveState, serverError } = form;
  const categoryName = categories.find((c) => c.id === values.categoryId)?.name ?? "";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader title="基本信息" />
            <CardBody>
              <BasicSection
                values={values}
                update={update}
                errors={errors}
                categories={categories}
                skuOverride={form.skuOverride}
                stack={form.stack}
                onSelectItem={form.selectItem}
                onSelectService={form.selectService}
                onToggleStack={form.toggleStack}
                onEnableOverride={form.enableSkuOverride}
                onDisableOverride={form.disableSkuOverride}
                onSkuChange={(sku) => update({ sku })}
                onUnavailable={form.setItemsUnavailable}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="价格与库存" />
            <CardBody>
              <PriceStockSection values={values} update={update} errors={errors} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="售卖窗口" />
            <CardBody>
              <ScheduleSection values={values} update={update} errors={errors} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="展示与排序" />
            <CardBody>
              <PublishSection values={values} update={update} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="详情" />
            <CardBody>
              <DetailSection values={values} update={update} />
            </CardBody>
          </Card>
        </div>

        <aside className="order-first flex min-w-0 flex-col gap-4 xl:order-last xl:sticky xl:top-20 xl:self-start">
          <ProductImagePanel
            images={values.images}
            onChange={(images) => update({ images })}
            error={errors.images}
          />
          <Card>
            <CardHeader title="商城预览" />
            <CardBody>
              <StorefrontPreview values={values} categoryName={categoryName} />
            </CardBody>
          </Card>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#22385a] bg-[#0b1526]/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0 text-[13px]">
          {saveState === "saving" && <span className="text-[#93b2ce]">保存中…</span>}
          {saveState === "saved" && <span className="text-[#6ee7b7]">已保存</span>}
          {saveState === "error" && serverError && (
            <span role="alert" className="text-[#eda9a9]">
              {serverError}
            </span>
          )}
          {saveState !== "error" && dirty && (
            <span className="text-[#e8c877]">有未保存的修改</span>
          )}
          {!dirty && saveState === "idle" && (
            <span className="text-[#6482a3]">尚未修改</span>
          )}
        </div>
        <Button
          type="button"
          variant="primary"
          onClick={() => void form.submit()}
          disabled={busy}
          data-testid="product-form-save"
          className="px-6"
        >
          {busy ? "保存中…" : "保存"}
        </Button>
      </div>
    </div>
  );
}
