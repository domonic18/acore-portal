"use client";

import { useEffect } from "react";

/**
 * 404 采集 beacon(US4 T025,FR-312/research R8):
 * not-found 渲染后 fire-and-forget 上报当前相对路径;keepalive 保证页面
 * 立即关闭也不丢;不记 UA/referer(服务端只收 path)。
 */
export function NotFoundBeacon() {
  useEffect(() => {
    const path = `${window.location.pathname}${window.location.search}`;
    void fetch("/api/track/not-found", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path }),
      keepalive: true,
    }).catch(() => {
      // 静默:采集失败不影响 404 页呈现
    });
  }, []);
  return null;
}
