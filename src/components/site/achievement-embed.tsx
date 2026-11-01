"use client";

import { useEffect, useRef, useState } from "react";

const HINT_TIMEOUT_MS = 12_000;

/**
 * 首页「最近成就事件」嵌入:加载期给提示,超时给空态文案,
 * 高度受 maxHeight 约束,避免存量配置(185vh)在移动端撑出大片空白(issue #20)。
 */
export function AchievementEmbed({
  url,
  height,
  scrolling,
}: {
  url: string;
  height: string;
  scrolling: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => setTimedOut(true), HINT_TIMEOUT_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl bg-[#080d16]">
      <iframe
        src={url}
        title="最近成就"
        loading="lazy"
        scrolling={scrolling ? "auto" : "no"}
        onLoad={() => {
          setLoaded(true);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        }}
        className="w-full border-0 bg-[#080d16]"
        style={{ height, maxHeight: "68vh" }}
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#0a1220]/70 px-6 text-center text-sm text-[#8fa0b8]">
          {timedOut
            ? "最近成就数据暂不可用,可点右上角「新窗口打开」查看"
            : "正在加载最近成就…"}
        </div>
      )}
    </div>
  );
}
