"use client";
/**
 * 全站右下角 AI 助手抽屉(W7):悬浮球 → 420px 侧滑抽屉(窄屏全宽),
 * 与 /search 问答页共用同一后端(useAssistantRuntime 各持一会话)。
 * 由根 layout 的 HideOnAdmin 包裹挂载(后台表面不出悬浮球)。
 */
import { MessageCircleQuestion, RotateCcw, X } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useEffect, useState } from "react";

import { AssistantChat } from "./assistant-chat";
import { useAssistantRuntime } from "./use-assistant-runtime";

export function AssistantDrawer(): React.ReactElement {
  const [open, setOpen] = useState(false);
  const { runtime, banner, clearBanner, startNewThread } = useAssistantRuntime();

  // Esc 关闭(开合是纯 UI 态,与 runtime 生命周期无关)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="打开 AI 助手"
          className="fixed bottom-6 right-6 z-40 flex size-[52px] cursor-pointer items-center justify-center rounded-full border border-highlight/40 bg-gradient-to-br from-[#1d3050] to-[#101c30] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.9),0_0_18px_rgba(242,202,114,0.18)] transition-transform hover:scale-105"
        >
          <MessageCircleQuestion className="size-6 text-highlight" aria-hidden />
        </button>
      )}
      {open && (
        <div
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] animate-[slide-in-right_0.2s_ease-out] flex-col border-l border-line-strong bg-panel shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.9)]"
          role="dialog"
          aria-label="AI 助手"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-highlight-deep text-sm font-extrabold text-ink">
              克
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-heading">老克塔助手</h2>
              <p className="text-[11px] text-muted">站内内容问答 · 回答附来源</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                type="button"
                onClick={startNewThread}
                aria-label="开启新会话"
                title="开启新会话"
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-inset text-muted hover:text-heading"
              >
                <RotateCcw className="size-3.5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="关闭助手"
                className="flex size-7 cursor-pointer items-center justify-center rounded-lg border border-line bg-panel-inset text-muted hover:text-heading"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <AssistantRuntimeProvider runtime={runtime}>
              <AssistantChat banner={banner} onDismissBanner={clearBanner} />
            </AssistantRuntimeProvider>
          </div>
        </div>
      )}
    </>
  );
}
