"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

/** window.turnstile(api.js 注入后可用) */
type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

/**
 * Turnstile widget(M4 US2,T012):
 * - 自包含引 api.js(afterInteractive);轮询 window.turnstile 后 render
 *   (不依赖 next/script onLoad:dev StrictMode 双挂载下它可能不触发)
 * - token 经 onToken 上抛;expired/error 清 token 并 reset 重挂挑战
 * - 卸载 remove 防泄漏;仅 enabled=true 时由调用方渲染,关态零脚本零节点
 */
export default function TurnstileWidget({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const holderRef = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    let widgetId: string | null = null;

    const tryRender = () => {
      if (widgetId !== null) return true; // 已挂载
      const ts = window.turnstile;
      if (!ts) return false; // api.js 未就绪,继续等
      widgetId = ts.render(el, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => {
          onTokenRef.current("");
          if (widgetId !== null) {
            ts.reset(widgetId);
          }
        },
        "error-callback": () => onTokenRef.current(""),
        theme: "auto",
      });
      return true;
    };

    if (!tryRender()) {
      const timer = window.setInterval(() => {
        if (tryRender()) {
          window.clearInterval(timer);
        }
      }, 200);
      return () => {
        window.clearInterval(timer);
        if (widgetId !== null) {
          window.turnstile?.remove(widgetId);
        }
      };
    }
    return () => {
      if (widgetId !== null) {
        window.turnstile?.remove(widgetId);
      }
    };
  }, [siteKey]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        strategy="afterInteractive"
      />
      <div ref={holderRef} data-testid="turnstile-widget" />
    </>
  );
}
