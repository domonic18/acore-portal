"use client";

import { validateSkuBinding } from "@/constants/shop-sku";
import type { ProductFormValues } from "./use-product-form";

/**
 * 客户端字段级校验(纯函数,与服务端 zod + 交叉校验同口径但更早):
 * 服务端仍是最终闸门——这里只为「不提交就知道错在哪」。
 */

export type ProductFieldErrors = Partial<Record<string, string>>;

export function validateProductForm(
  values: ProductFormValues,
  /** 所选物品的最大堆叠数(1=不可堆叠);null=未知 */
  itemStackable?: number | null,
): ProductFieldErrors {
  const errors: ProductFieldErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = "请填写商品名称";
  else if (name.length > 100) errors.name = "名称不超过 100 字";

  const slug = values.slug.trim();
  if (!slug) errors.slug = "请填写别名(slug)";
  else if (!/^[a-z0-9-]+$/.test(slug)) errors.slug = "别名只能用小写字母、数字与连字符";
  else if (slug.length > 100) errors.slug = "别名不超过 100 字";

  if (!values.categoryId) errors.categoryId = "请选择分类";

  if (!Number.isInteger(values.price) || values.price < 0) {
    errors.price = "原价须为不小于 0 的整数";
  }
  if (values.salePrice != null) {
    if (!Number.isInteger(values.salePrice) || values.salePrice < 0) {
      errors.salePrice = "促销价须为不小于 0 的整数";
    } else if (values.salePrice >= values.price) {
      errors.salePrice = "促销价必须低于原价";
    }
  }

  if (values.saleStart && values.saleEnd) {
    if (new Date(values.saleStart) >= new Date(values.saleEnd)) {
      errors.saleEnd = "促销结束须晚于促销开始";
    }
  }

  if (values.stockEnabled) {
    if (values.stock == null || values.stock < 0) {
      errors.stock = "库存须为不小于 0 的整数";
    }
    if (values.lowStockThreshold != null && values.lowStockThreshold < 0) {
      errors.lowStockThreshold = "低库存阈值须为不小于 0 的整数";
    }
  }
  if (values.maxPerUser != null && values.maxPerUser < 1) {
    errors.maxPerUser = "每人限购至少 1 件";
  }
  if (values.images.length > 20) errors.images = "图片最多 20 张";

  const binding = validateSkuBinding({
    type: values.type,
    sku: values.sku,
    gameItemId: values.gameItemId ?? null,
    handlerKey: values.handlerKey,
    stackable: itemStackable ?? null,
  });
  if (binding) errors[binding.field] = binding.message;

  return errors;
}

/** 别名自动生成:仅 ASCII 名称能产出合法 slug(纯中文名请手动填写) */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}
