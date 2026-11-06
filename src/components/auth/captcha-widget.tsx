"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

/** 官方入口脚本(必须动态加载,不能用 xhr/fetch 引入,否则 CORS) */
const SDK_URL = "https://turing.captcha.qcloud.com/TJCaptcha.js";

type CaptchaCallbackResult = {
  /** 0=验证通过,2=用户主动关闭 */
  ret: number;
  ticket?: string;
  randstr?: string;
  /** 非空表示前端异常(官方容灾票据 errorCode) */
  errorCode?: number;
  errorMessage?: string;
};

type CaptchaInstance = { show: () => void; destroy?: () => void };
type TencentCaptchaCtor = new (
  appid: string,
  callback: (res: CaptchaCallbackResult) => void,
  options?: Record<string, unknown>
) => CaptchaInstance;

declare global {
  interface Window {
    TencentCaptcha?: TencentCaptchaCtor;
  }
}

type Phase = "ready" | "loading" | "verified" | "failed";

/**
 * 腾讯云验证码(TCaptcha)前端控件(2026-11-07 替换 Turnstile):
 * - 弹窗式:用户点按钮 → TencentCaptcha.show() → 回调带 ticket/randstr 上抛
 * - 票据 5 分钟有效、一次性使用(官方),服务端凭 ticket+randstr 做二次校验
 * - 控件只负责「拿到一对 ticket/randstr」,不做任何本地判定
 */
export default function CaptchaWidget({
  appId,
  onVerify,
}: {
  appId: string;
  onVerify: (ticket: string, randstr: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [sdkFailed, setSdkFailed] = useState(false);
  const instanceRef = useRef<CaptchaInstance | null>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  useEffect(() => {
    return () => {
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, []);

  const handleCallback = useCallback((res: CaptchaCallbackResult) => {
    if (res.ret === 0 && res.ticket && res.randstr) {
      setPhase("verified");
      onVerifyRef.current(res.ticket, res.randstr);
      return;
    }
    if (res.ret === 2) {
      // 用户主动关闭弹窗:回到未验证状态,可再次点击
      setPhase("ready");
      return;
    }
    setPhase("failed");
  }, []);

  const handleClick = useCallback(() => {
    setPhase("loading");
    const show = () => {
      const Ctor = window.TencentCaptcha;
      if (!Ctor) return false;
      try {
        instanceRef.current?.destroy?.();
        instanceRef.current = new Ctor(appId, handleCallback);
        instanceRef.current.show();
      } catch {
        setPhase("failed");
      }
      return true;
    };
    if (show()) return;
    // 脚本尚未就绪:轮询等待(官方要求实例化前脚本已加载)
    const timer = window.setInterval(() => {
      if (show()) window.clearInterval(timer);
    }, 200);
    window.setTimeout(() => window.clearInterval(timer), 8000);
  }, [appId, handleCallback]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={phase === "verified" || phase === "loading"}
        data-testid="captcha-trigger"
        className="w-full rounded-md border border-line bg-panel-inset px-3 py-2 text-sm text-heading hover:border-accent disabled:opacity-60"
      >
        {phase === "verified"
          ? "人机验证已通过"
          : phase === "loading"
            ? "人机验证加载中…"
            : phase === "failed"
              ? "人机验证失败,点击重试"
              : "点击完成人机验证"}
      </button>
      {phase === "failed" && (
        <p data-testid="captcha-hint" className="text-xs text-muted">
          {sdkFailed
            ? "人机验证脚本加载失败,请检查网络后刷新重试。"
            : "未能完成人机验证,请点击重试。"}
        </p>
      )}
      <Script src={SDK_URL} strategy="afterInteractive" onError={() => setSdkFailed(true)} />
    </div>
  );
}
