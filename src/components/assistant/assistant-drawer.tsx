"use client";
/**
 * 全站右下角 AI 助手悬浮球(2026-11-18 重写:拖拽微调/隐藏恢复 + 懒加载):
 * - 垂直拖拽:按住球体上下拖(pointer events,超 4px 判拖拽、否则算点击),
 *   水平贴右缘不变,范围限视口内避开页头
 * - 隐藏:桌面 hover 出右上角 ✕,触屏长按 0.5s 弹同款 ✕(长按不触发点击);
 *   隐藏后右缘保留「小塔助手」竖排页签,点击恢复
 * - 位置与隐藏态记 localStorage(assistant.fab.y / assistant.fab.hidden),只影响本机
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

const FAB_SIZE = 52;
const TOP_SAFE = 96; // 页头(lg 88px)+ 余量,球不进页头
const EDGE = 16;
const Y_KEY = "assistant.fab.y";
const HIDDEN_KEY = "assistant.fab.hidden";
const DRAG_THRESHOLD = 4;
const LONG_PRESS_MS = 550;

function clampBottom(y: number): number {
  const max = Math.max(EDGE, window.innerHeight - TOP_SAFE - FAB_SIZE);
  return Math.min(Math.max(y, EDGE), max);
}

export function AssistantDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [fabBottom, setFabBottom] = useState(24);
  const [showActions, setShowActions] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startYRef = useRef(0);
  const startBottomRef = useRef(0);
  const dragMovedRef = useRef(false);
  const longPressRef = useRef(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // localStorage 恢复(首帧默认位,水合后贴存档位;私密模式存取失败回落默认)
  useEffect(() => {
    try {
      const y = Number(window.localStorage.getItem(Y_KEY));
      if (Number.isFinite(y) && y > 0) setFabBottom(clampBottom(y));
      if (window.localStorage.getItem(HIDDEN_KEY) === "1") setHidden(true);
    } catch {
      /* 存取不可用即默认位 */
    }
  }, []);

  const clearPressTimer = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }, []);

  const persistY = (y: number) => {
    try {
      window.localStorage.setItem(Y_KEY, String(Math.round(y)));
    } catch {
      /* 存取不可用即不记 */
    }
  };
  const persistHidden = (v: boolean) => {
    try {
      window.localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
    } catch {
      /* 存取不可用即不记 */
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragMovedRef.current = false;
    longPressRef.current = false;
    startYRef.current = e.clientY;
    startBottomRef.current = fabBottom;
    e.currentTarget.setPointerCapture(e.pointerId);
    // 触屏长按弹 ✕(桌面 hover 即有,定时器对两者无害)
    clearPressTimer();
    pressTimer.current = setTimeout(() => {
      longPressRef.current = true;
      setShowActions(true);
    }, LONG_PRESS_MS);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const deltaY = e.clientY - startYRef.current;
    if (!dragMovedRef.current && Math.abs(deltaY) < DRAG_THRESHOLD) return;
    if (!dragMovedRef.current) {
      dragMovedRef.current = true;
      setDragging(true);
      clearPressTimer();
    }
    setFabBottom(clampBottom(startBottomRef.current - deltaY));
  };

  const endDrag = () => {
    clearPressTimer();
    if (dragMovedRef.current) {
      setDragging(false);
      persistY(fabBottom);
    }
  };

  const onBallClick = () => {
    // 拖拽结束与长按后的 click 均抑制,只有纯点击展开对话
    if (!dragMovedRef.current && !longPressRef.current) setOpen(true);
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

  if (open) return <AssistantPanel onClose={() => setOpen(false)} />;

  if (hidden) {
    return (
      <button
        type="button"
        onClick={restoreFab}
        aria-label="展开小塔助手"
        style={{ bottom: fabBottom }}
        className="fixed right-0 z-40 cursor-pointer rounded-l-lg border border-r-0 border-highlight/40 bg-gradient-to-b from-[#1d3050] to-[#101c30] py-3.5 pl-2 pr-1.5 shadow-[-6px_0_18px_-8px_rgba(0,0,0,0.9)] hover:from-[#24395e]"
      >
        <span className="block text-[13px] font-bold tracking-[2px] text-highlight [writing-mode:vertical-rl]">
          小塔助手
        </span>
      </button>
    );
  }

  return (
    <div className="group fixed right-6 z-40" style={{ bottom: fabBottom }}>
      <button
        type="button"
        onClick={onBallClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="打开 AI 助手"
        style={{ touchAction: "none" }}
        className={`flex size-[52px] items-center justify-center overflow-hidden rounded-full border border-highlight/40 bg-gradient-to-br from-[#1d3050] to-[#101c30] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9),0_0_18px_rgba(242,202,114,0.18)] transition-transform hover:scale-105 ${
          dragging ? "cursor-grabbing" : "cursor-grab"
        }`}
      >
        {/* 守望塔小石人头像(贴「小塔助手」名;52px 显示,256px 原图高清屏不糊) */}
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
  );
}
