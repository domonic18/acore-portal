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
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
        }}
        className="h-full w-full border-0"
      />
      {!loaded && !timedOut && (
        <div
          role="status"
          className="absolute inset-0 flex items-center justify-center bg-[#0a1220]"
        >
          <span className="text-sm text-[#8fa0b8]">加载中…</span>
        </div>
      )}
      {timedOut && (
        <div
          data-testid="tools-fallback"
          className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-[#0a1220]"
        >
          <p className="text-sm text-[#c7d2e0]">工具服务暂不可用</p>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-[#c9a227] px-4 py-2 text-sm text-[#e6d8a8] hover:bg-[#16233a]"
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
          className="absolute right-3 top-3 rounded border border-[#243350] bg-[#0d1728]/90 px-3 py-1.5 text-xs text-[#c7d2e0] hover:border-[#c9a227] hover:text-[#e6d8a8]"
        >
          新窗口打开 ↗
        </a>
      )}
    </div>
  );
}
