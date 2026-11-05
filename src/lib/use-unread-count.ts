"use client";

import { useEffect, useRef, useState } from "react";
import { requestJson } from "@/lib/api-client";
import { UNREAD_POLL_INTERVAL_MS } from "@/constants/notification";

/**
 * 未读数轮询数据 Hook(issue #85:数据 Hook 与纯展示分离):
 * mount 拉基线(不提示),此后定时轮询;count 增长量以 delta 返回供展示层决定弹泡。
 * 收件箱页已读操作后经 window 事件 "ap:unread-changed" 即时刷新。
 */
export function useUnreadCount(intervalMs: number = UNREAD_POLL_INTERVAL_MS): {
  count: number | null;
  /** 最近一次轮询的未读增长量(0=无增长) */
  delta: number;
} {
  const [count, setCount] = useState<number | null>(null);
  const [delta, setDelta] = useState(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const body = await requestJson<{ count: number }>(
          "/api/account/notifications/unread",
          { cache: "no-store" },
        );
        if (!alive) return;
        const last = lastRef.current;
        setDelta(last !== null && body.count > last ? body.count - last : 0);
        lastRef.current = body.count;
        setCount(body.count);
      } catch {
        // 轮询失败静默(不打扰)
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), intervalMs);
    const onChanged = () => void poll();
    window.addEventListener("ap:unread-changed", onChanged);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("ap:unread-changed", onChanged);
    };
  }, [intervalMs]);

  return { count, delta };
}
