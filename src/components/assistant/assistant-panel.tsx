"use client";
/**
 * 助手对话面板(自 assistant-drawer 拆出,2026-11-18 性能优化):
 * 经 next/dynamic 懒加载,只在悬浮球展开时进 bundle——
 * @assistant-ui/react + react-markdown 依赖链不再打进全站首屏 JS。
 * 与 /search 问答页共用同一后端(useAssistantRuntime 各持一会话)。
 */
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { RotateCcw, X } from "lucide-react";

import { AssistantChat } from "./assistant-chat";
import { useAssistantRuntime } from "./use-assistant-runtime";

export default function AssistantPanel({ onClose }: { onClose: () => void }) {
  const { runtime, banner, clearBanner, startNewThread } = useAssistantRuntime();

  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] animate-[slide-in-right_0.2s_ease-out] flex-col border-l border-line-strong bg-panel shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.9)]"
      role="dialog"
      aria-label="AI 助手"
    >
      <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
        {/* 守望塔小石人头像(与悬浮球同源,public/assistant-avatar.png) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/assistant-avatar.png"
          alt=""
          width={32}
          height={32}
          className="size-8 rounded-lg"
        />
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-heading">小塔助手</h2>
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
            onClick={onClose}
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
  );
}
