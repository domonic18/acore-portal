"use client";
/**
 * 全站右下角 AI 助手悬浮球(2026-11-18 二次反馈:去拖拽,只留显示/隐藏):
 * - 隐藏:桌面 hover 出右上角 ✕,触屏长按 0.5s 弹同款 ✕(长按不触发点击);
 *   隐藏后右缘保留「小塔助手」竖排页签,点击恢复
 * - 隐藏态记 localStorage(assistant.fab.hidden),只影响本机
 * - 对话面板 assistant-panel 经 next/dynamic(ssr:false)首开才拉,
 *   @assistant-ui 依赖链退出全站首屏 bundle
 * 由根 layout 的 HideOnAdmin 包裹挂载(后台表面不出悬浮球)。
 */
import { X } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";

const AssistantPanel = dynamic(() => import("./assistant-panel"), {
  ssr: false,
  loading: () => (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l border-line-strong bg-panel"
      role="dialog"
      aria-label="AI 助手"
    >
      <div className="flex flex-1 items-center justify-center text-sm text-muted">
        助手加载中…
      </div>
    </div>
  ),
});

const HIDDEN_KEY = "assistant.fab.hidden";
const LONG_PRESS_MS = 550;

export function AssistantDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false);
  // 面板一经打开保持挂载(问题3 反馈:关了再开要看到上次对话,runtime
  // 内存态随卸载丢失;关闭只切 CSS 隐藏,懒加载语义由 mounted 承担)
  const [panelMounted, setPanelMounted] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const longPressRef = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage 恢复隐藏态(私密模式存取失败回落显示)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(HIDDEN_KEY) === "1") setHidden(true);
    } catch {
      /* 存取不可用即默认显示 */
    }
  }, []);

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const persistHidden = (v: boolean) => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
    } catch {
      /* 存取不可用即不记 */
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    longPressRef.current = false;
    // 触屏长按弹 ✕(桌面 hover 即有,定时器对两者无害)
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      longPressRef.current = true;
      setShowActions(true);
    }, LONG_PRESS_MS);
  };

  const onPointerEnd = () => {
    clearPressTimer();
  };

  const onBallClick = () => {
    // 长按后的 click 抑制,只有纯点击展开对话
    if (!longPressRef.current) {
      setPanelMounted(true);
      setOpen(true);
    }
  };

  const hideFab = () => {
    setShowActions(false);
    setHidden(true);
    persistHidden(true);
  };

  const restoreFab = () => {
    setHidden(false);
    persistHidden(false);
  };

  if (hidden) {
    return (
      <button
        type="button"
        onClick={restoreFab}
        aria-label="展开小塔助手"
        className="fixed bottom-6 right-0 z-40 cursor-pointer rounded-l-lg border border-r-0 border-highlight/40 bg-gradient-to-b from-[#1d3050] to-[#101c30] py-3.5 pl-2 pr-1.5 shadow-[-6px_0_18px_-8px_rgba(0,0,0,0.9)] hover:from-[#24395e]"
      >
        <span className="block text-[13px] font-bold tracking-[2px] text-highlight [writing-mode:vertical-rl]">
          小塔助手
        </span>
      </button>
    );
  }

  return (
    <>
      <div className="group fixed bottom-6 right-6 z-40">
        <button
          type="button"
          onClick={onBallClick}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          aria-label="打开 AI 助手"
          className="flex size-[52px] items-center justify-center overflow-hidden rounded-full border border-highlight/40 bg-gradient-to-br from-[#1d3050] to-[#101c30] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9),0_0_18px_rgba(242,202,114,0.18)] transition-transform hover:scale-105"
        >
          {/* 熊猫人头像(用户定稿;52px 显示,原图高清屏不糊) */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assistant-avatar.png"
            alt=""
            width={52}
            height={52}
            draggable={false}
            className="size-full select-none rounded-full object-cover"
          />
        </button>
        <button
          type="button"
          onClick={hideFab}
          aria-label="隐藏悬浮球"
          title="隐藏悬浮球"
          className={`absolute -right-0.5 -top-0.5 size-5 items-center justify-center rounded-full border border-line-strong bg-panel text-muted hover:text-heading ${
            showActions ? "flex" : "hidden group-hover:flex"
          }`}
        >
          <X className="size-3" aria-hidden />
        </button>
      </div>
      {panelMounted && (
        <div className={open ? "contents" : "hidden"}>
          <AssistantPanel onClose={() => setOpen(false)} />
        </div>
      )}
    </>
  );
}
