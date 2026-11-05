"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";
import type { ServerStatusResult } from "@/lib/status-types";
import { STATUS_POLL_INTERVAL_MS } from "@/constants/status";

/**
 * 服务器状态轮询数据 Hook(issue #85:数据 Hook 与纯展示分离):
 * SSR 初值 + 定时轮询 /api/status;失败保留上次渲染,下周期重试。
 */
export function useStatusPoll(
  initial: ServerStatusResult,
  intervalMs: number = STATUS_POLL_INTERVAL_MS,
): ServerStatusResult {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const next = await requestJson<ServerStatusResult>("/api/status", {
          cache: "no-store",
        });
        if (alive) setStatus(next);
      } catch {
        // 网络抖动保留上次渲染,下个周期重试
      }
    };
    const timer = setInterval(poll, intervalMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return status;
}
