"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  buildHeightAvailableMessage,
  isIframeNavigated,
  isMessageFromIframe,
  parseAvailableHeightRequest,
  resolveIframeOrigin,
} from "@/lib/iframe-height";
import { HOME_ACHIEVEMENT_HEIGHT } from "@/constants/home";

const HINT_TIMEOUT_MS = 12_000;

/**
 * 首页「最近成就事件」嵌入:加载期给提示,超时给空态文案。
 * 高度口径(2026-11-07):后台配的高度作**最小高度**,硬顶 68vh;
 * 桌面端外层区块随首页右栏拉伸(两列等高),此处 flex-auto 以设定高度为基线再吃掉剩余高度,iframe 填满。
 *
 * 嵌入协议(2026-11-07):本区块框高固定(不能像工具页那样撑高 iframe,否则右栏被拉爆),
 * 框内若出现内层滚动条会与页面滚动打架。rank 子站据此需要知道「我能用多高」——
 * 父页把 iframe 框高下发给子页,子页自行裁剪内容(底部渐隐)。
 * 协议对端:acore-ranking frontend/src/shared/hooks/useEmbedAvailableHeight.ts
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
  const iframeRef = useRef<HTMLIFrameElement>(null);
  /** 把 iframe 框高下发给子页(父 → 子) */
  const publishAvailableHeight = useCallback(() => {
    const iframe = iframeRef.current;
    // 未完成导航不投递:contentWindow 还是 about:blank(origin 继承父页)时,
    // 按子站 origin 投递会被浏览器拒收并报 "target origin ... does not match"。
    // 子页有重试索要兜底,不会漏发。
    if (!iframe || !isIframeNavigated(iframe)) return;
    const message = buildHeightAvailableMessage(iframe.getBoundingClientRect().height);
    if (!message) return;
    iframe.contentWindow?.postMessage(message, resolveIframeOrigin(url) ?? "*");
  }, [url]);

  // 框高变化即重新下发(栅格拉伸、窗口缩放、后台改「显示高度」都会触发)
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const observer = new ResizeObserver(() => publishAvailableHeight());
    observer.observe(iframe);
    return () => observer.disconnect();
  }, [publishAvailableHeight]);

  // 子页索要可用高度 → 回推(补「子页监听器晚于父页 load」的竞态)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe) return;
      if (!isMessageFromIframe(event, iframe)) return;
      if (!parseAvailableHeightRequest(event.data)) return;
      publishAvailableHeight();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [publishAvailableHeight]);

  useEffect(() => {
    timerRef.current = window.setTimeout(() => setTimedOut(true), HINT_TIMEOUT_MS);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div
      className="relative h-[var(--achievement-height)] overflow-hidden rounded-xl bg-deep lg:flex-auto"
      style={
        {
          // 高度硬顶:存量后台配了 185vh/500vh,不设顶会撑爆首屏
          "--achievement-height": `min(${height}, ${HOME_ACHIEVEMENT_HEIGHT})`,
        } as CSSProperties
      }
    >
      <iframe
        ref={iframeRef}
        src={url}
        title="最近成就"
        loading="lazy"
        scrolling={scrolling ? "auto" : "no"}
        onLoad={() => {
          setLoaded(true);
          if (timerRef.current !== null) window.clearTimeout(timerRef.current);
          publishAvailableHeight();
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
