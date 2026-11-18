"use client";
/**
 * /search Agent 问答面(W7,与右下角抽屉共用 AssistantChat 与同一后端,
 * 各持独立会话):hero 态由页头承载,本组件只渲染大版心会话区 + 新会话入口。
 */
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { RotateCcw } from "lucide-react";

import { AssistantChat } from "@/components/assistant/assistant-chat";
import { useAssistantRuntime } from "@/components/assistant/use-assistant-runtime";

export function SearchChat(): React.ReactElement {
  const { runtime, banner, clearBanner, startNewThread } = useAssistantRuntime();
  return (
    <div className="flex h-[68vh] min-h-[460px] flex-col overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="text-sm font-semibold text-heading">小塔助手</span>
        <span className="text-[11px] text-muted">站内内容问答 · 回答附来源链接</span>
        <button
          type="button"
          onClick={startNewThread}
          className="ml-auto flex items-center gap-1 rounded-md border border-line bg-panel-inset px-2 py-1 text-[11px] text-muted hover:text-heading"
        >
          <RotateCcw className="size-3" aria-hidden />
          新会话
        </button>
      </div>
      <AssistantRuntimeProvider runtime={runtime}>
        <AssistantChat banner={banner} onDismissBanner={clearBanner} />
      </AssistantRuntimeProvider>
    </div>
  );
}
