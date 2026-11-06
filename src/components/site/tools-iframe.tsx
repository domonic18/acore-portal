"use client";

import { useEffect, useRef, useState } from "react";
import { TOOLS_IFRAME_TIMEOUT_MS } from "@/constants/tools";

/**
 * 工具页 iframe 容器(T021,契约 tools-and-seo §六工具页):
 * 撑满页头(3.5rem)以下视口;12s 未 load 降级「工具服务暂不可用」卡+新窗口外链出口;
 * iframe 常驻 DOM(外部可用性不参与页面自身 200 断言,SC-301),常驻外链按钮右上角。
 */
export function ToolsIframe({
  src,
  title,
  heightClass = "h-[calc(100vh-3.5rem)]",
  showExternal = true,
}: {
  src: string;
  title: string;
  /** 外层高度;p05 工具页壳套浏览器框时由父容器定高 */
  heightClass?: string;
  /** 页壳自带外链按钮时关掉浮层按钮,避免压住 iframe 内容 */
  showExternal?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    timerRef.current = window.setTimeout(
      () => setTimedOut(true),
      TOOLS_IFRAME_TIMEOUT_MS,
    );
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={`relative w-full ${heightClass}`}>
      <iframe
        src={src}
        title={title}
        data-testid="tools-iframe"
        onLoad={() => {
          setLoaded(true);
          setTimedOut(false);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        }}
        className="h-full w-full border-0"
      />
      {/* 加载提示不遮挡 iframe:慢加载时也能看到逐步绘制的内容(issue #23) */}
      {!loaded && !timedOut && (
        <div
          role="status"
          className="pointer-events-none absolute left-3 top-3 rounded bg-page/90 px-2.5 py-1 text-xs text-muted"
        >
          加载中…
        </div>
      )}
      {timedOut && !loaded && (
        <div
          data-testid="tools-fallback"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-page"
        >
          <p className="text-sm text-foreground">工具服务暂不可用</p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-highlight-deep px-4 py-2 text-sm text-highlight-soft hover:bg-surface"
          >
            在新窗口打开
          </a>
        </div>
      )}
      {showExternal && (
        <a
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="tools-open-external"
          className="absolute right-3 top-3 rounded border border-line-muted bg-panel-inset/90 px-3 py-1.5 text-xs text-foreground hover:border-highlight-deep hover:text-highlight-soft"
        >
          新窗口打开 ↗
        </a>
      )}
    </div>
  );
}
