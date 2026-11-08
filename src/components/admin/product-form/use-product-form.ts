"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TRANSMOG_ITEM_SKU_PREFIX } from "@/constants/shop";
import {
  buildItemSendSku,
  deriveSku,
  isStackSku,
  validateSkuBinding,
} from "@/constants/shop-sku";
import { slugify, validateProductForm, type ProductFieldErrors } from "./validation";

/**
 * 商品表单状态机(两栏编辑台的数据侧):
 * 单一真相 = values;SKU 由「所选游戏物品」自动派生(高级区可覆盖),
 * 派生方向单向(物品 → SKU),手改 SKU 不会改物品。
 */

export type ProductFormValues = {
  id?: string;
  type: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  images: string[];
  detailMd: string;
  categoryId: string;
  price: number;
  salePrice?: number | null;
  saleStart?: string | null;
  saleEnd?: string | null;
  stockEnabled: boolean;
  stock?: number | null;
  lowStockThreshold?: number | null;
  maxPerUser?: number | null;
  gameItemId?: number | null;
  status: string;
  listed: boolean;
  featured: boolean;
};

export type SaveState = "idle" | "saving" | "saved" | "error";

function defaults(categories: { id: string }[]): ProductFormValues {
  return {
    type: "game_item",
    sku: "",
    name: "",
    slug: "",
    description: "",
    images: [],
    detailMd: "",
    categoryId: categories[0]?.id ?? "",
    price: 0,
    stockEnabled: false,
    status: "draft",
    listed: true,
    featured: false,
  };
}

/** 由所选物品派生 SKU:保留变形(transmog)前缀,保留堆叠形态 */
function deriveSkuFor(prev: ProductFormValues, entry: number): string {
  return (
    deriveSku({
      type: prev.type,
      gameItemId: entry,
      stack: isStackSku(prev.sku),
      currentSku: prev.sku,
    }) ?? prev.sku
  );
}

export function useProductForm({
  initial,
  categories,
}: {
  initial?: ProductFormValues;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(() => initial ?? defaults(categories));
  const [skuOverride, setSkuOverride] = useState(false);
  const [errors, setErrors] = useState<ProductFieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [serverError, setServerError] = useState<string | null>(null);
  const [serverField, setServerField] = useState<string | null>(null);
  const [itemsUnavailable, setItemsUnavailable] = useState(false);
  const slugTouched = useRef(Boolean(initial?.slug));

  const baseline = useMemo(
    () => JSON.stringify(initial ?? defaults(categories)),
    [initial, categories],
  );
  const dirty = useMemo(() => JSON.stringify(values) !== baseline, [values, baseline]);

  // 高级模式下手改 SKU 的实时校验:不等提交当场提示「SKU 与所选物品不一致」
  const liveSkuError = useMemo(() => {
    if (!skuOverride) return undefined;
    const binding = validateSkuBinding({
      type: values.type,
      sku: values.sku,
      gameItemId: values.gameItemId ?? null,
    });
    return binding?.message;
  }, [skuOverride, values.type, values.sku, values.gameItemId]);

  const update = useCallback(
    (patch: Partial<ProductFormValues>) => {
      setServerError(null);
      setServerField(null);
      setValues((prev) => {
        const next = { ...prev, ...patch };
        if (patch.gameItemId !== undefined && next.gameItemId != null && !skuOverride) {
          next.sku = deriveSkuFor(prev, next.gameItemId);
        }
        if (patch.name !== undefined && !slugTouched.current) {
          const auto = slugify(patch.name);
          if (auto) next.slug = auto;
        }
        if (patch.slug !== undefined) slugTouched.current = true;
        return next;
      });
    },
    [skuOverride],
  );

  const toggleStack = useCallback(
    (next: boolean) => {
      setValues((prev) => {
        if (prev.gameItemId == null) return prev;
        const value = {
          ...prev,
          sku: prev.sku.startsWith(TRANSMOG_ITEM_SKU_PREFIX)
            ? prev.sku
            : buildItemSendSku(prev.gameItemId, { stack: next }),
        };
        return value;
      });
    },
    [],
  );

  const enableSkuOverride = useCallback(() => {
    setSkuOverride(true);
  }, []);

  const disableSkuOverride = useCallback(() => {
    setSkuOverride(false);
    setValues((prev) =>
      prev.gameItemId == null ? prev : { ...prev, sku: deriveSkuFor(prev, prev.gameItemId) },
    );
  }, []);

  // 未保存守卫:仅能拦刷新/关闭标签页(App Router 无路由级拦截,站内跳转靠黄条提示)
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  async function submit() {
    const found = validateProductForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSaveState("error");
      setServerError("有字段未通过校验,请检查标红的字段。");
      return;
    }
    if (values.type === "game_item" && itemsUnavailable) {
      setSaveState("error");
      setServerError("游戏数据暂时不可用,无法校验所选物品,请稍后重试。");
      return;
    }
    setBusy(true);
    setSaveState("saving");
    setServerError(null);
    setServerField(null);
    try {
      const res = await fetch("/api/admin/products", {
        method: initial?.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        // datetime-local 空串统一转 null(z.coerce.date 不接受空串)
        body: JSON.stringify({
          ...values,
          saleStart: values.saleStart || null,
          saleEnd: values.saleEnd || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as
        | { error?: { code?: string; message?: string; field?: string } }
        | null;
      if (!res.ok) {
        const err = body?.error;
        setServerError(err?.message ?? `请求失败(HTTP ${res.status}),请稍后重试。`);
        setServerField(err?.field ?? null);
        setSaveState("error");
        return;
      }
      setSaveState("saved");
      router.push("/admin/products");
      router.refresh();
    } catch {
      setServerError("网络异常,请稍后重试。");
      setSaveState("error");
    } finally {
      setBusy(false);
    }
  }

  const mergedErrors: ProductFieldErrors = {
    ...errors,
    ...(liveSkuError ? { sku: liveSkuError } : {}),
    ...(serverField ? { [serverField]: serverError ?? undefined } : {}),
  };

  return {
    values,
    update,
    errors: mergedErrors,
    dirty,
    busy,
    saveState,
    serverError,
    submit,
    skuOverride,
    enableSkuOverride,
    disableSkuOverride,
    stack: isStackSku(values.sku),
    toggleStack,
    itemsUnavailable,
    setItemsUnavailable,
  };
}
