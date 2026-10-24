"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SidebarCard } from "./card";

export type RecentProduct = {
  slug: string;
  name: string;
  price: number;
};

export const RECENT_PRODUCTS_KEY = "recent_products";
export const RECENT_PRODUCTS_MAX = 10;

/** 读取埋点数据(M2 商品详情写入;纯客户端 R9) */
export function readRecentProducts(): RecentProduct[] {
  try {
    const raw = window.localStorage.getItem(RECENT_PRODUCTS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentProduct[]) : [];
  } catch {
    return [];
  }
}

/** 最近浏览商品(R9):localStorage 本地历史,空历史整卡隐藏 */
export function RecentProducts() {
  const [items, setItems] = useState<RecentProduct[] | null>(null);
  useEffect(() => {
    setItems(readRecentProducts().slice(0, RECENT_PRODUCTS_MAX));
  }, []);
  if (items === null || items.length === 0) return null;
  return (
    <SidebarCard title="最近浏览" testId="sidebar-recent-products">
      <ul className="space-y-1.5 text-xs">
        {items.map((p) => (
          <li key={p.slug} className="flex justify-between gap-2">
            <Link
              href={`/shop/${encodeURIComponent(p.slug)}`}
              className="line-clamp-1 text-[#c7d2e0] hover:text-[#e6d8a8]"
            >
              {p.name}
            </Link>
            <span className="shrink-0 text-[#e6d8a8]">{p.price}</span>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}
