"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * 发货态轮询(FR-117,T035):delivering/delivery_failed 每 30s router.refresh()
 * (发货自动闭环 SC-102,无需 WebSocket);终态不轮询。
 */
const POLL_INTERVAL_MS = 30_000;

export function OrderStatusPoll({ status }: { status: string }) {
  const router = useRouter();
  const active = status === "delivering" || status === "delivery_failed";

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [active, router]);

  if (!active) return null;
  return (
    <p className="text-xs text-gray-500" role="status">
      发货状态每 30 秒自动刷新…
    </p>
  );
}
