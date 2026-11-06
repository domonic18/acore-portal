"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { requestJson } from "@/lib/api-client";
import { PAGE_VIEW_EXCLUDED_PREFIXES } from "@/constants/page-view";

/**
 * 页面访问 beacon(自建流量统计,替代 umami 采集脚本):
 * 路由变化时 fire-and-forget 上报当前 pathname;软导航(客户端路由切换)同样计入。
 * 后台与旧 WP 后台路径不上报;keepalive 保证页面立即关闭也不丢。
 */
export function PageViewBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    if (PAGE_VIEW_EXCLUDED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return;
    }
    void requestJson("/api/track/pageview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      keepalive: true,
    }).catch(() => {
      // 静默:采集失败不影响页面
    });
  }, [pathname]);

  return null;
}
