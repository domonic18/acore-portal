"use client";

import { useEffect } from "react";
import {
  RECENT_PRODUCTS_KEY,
  RECENT_PRODUCTS_MAX,
  type RecentProduct,
} from "./recent-products";

/** 商品详情浏览埋点(T019):写 localStorage 最近浏览(去重置顶,上限 10) */
export function RecentProductTracker(product: RecentProduct) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RECENT_PRODUCTS_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? (parsed as RecentProduct[]) : [];
      const next = [
        product,
        ...list.filter((p) => p.slug !== product.slug),
      ].slice(0, RECENT_PRODUCTS_MAX);
      window.localStorage.setItem(RECENT_PRODUCTS_KEY, JSON.stringify(next));
    } catch {
      // localStorage 不可用(隐私模式)静默跳过
    }
  }, [product]);
  return null;
}
