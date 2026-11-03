"use client";

import { useEffect } from "react";
import { requestJson } from "@/lib/api-client";

/** 商品浏览上报(转化漏斗第一环):水合后 POST 一次,失败静默(观测非关键路径) */
export function ProductViewBeacon({ productId }: { productId: string }) {
  useEffect(() => {
    void requestJson("/api/shop/product-view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    }).catch(() => undefined);
  }, [productId]);
  return null;
}
