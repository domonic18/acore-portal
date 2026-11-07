"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { HOME_ACHIEVEMENT_HEIGHT } from "@/constants/home";

const HINT_TIMEOUT_MS = 12_000;

/**
 * 首页「最近成就事件」嵌入:加载期给提示,超时给空态文案。
 * 高度口径(2026-11-07):后台配的高度作**最小高度**,硬顶 68vh;
 * 桌面端外层区块随首页右栏拉伸(两列等高),此处 flex-1 吃掉剩余高度,iframe 填满。
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
    <div
      className="relative h-[var(--achievement-height)] overflow-hidden rounded-xl bg-deep lg:flex-1"
      style={
        {
          // 高度硬顶:存量后台配了 185vh/500vh,不设顶会撑爆首屏
          "--achievement-height": `min(${height}, ${HOME_ACHIEVEMENT_HEIGHT})`,
        } as CSSProperties
      }
    >
      <iframe
        src={url}
        title="最近成就"
        loading="lazy"
        scrolling={scrolling ? "auto" : "no"}
        onLoad={() => {
          setLoaded(true);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        }}
        className="h-full w-full border-0 bg-deep"
      />
      {!loaded && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-page/70 px-6 text-center text-sm text-muted">
          {timedOut
            ? "最近成就数据暂不可用,可点右上角「新窗口打开」查看"
            : "正在加载最近成就…"}
        </div>
      )}
    </div>
  );
}
