"use client";
/**
 * ask_user 中断卡(W7):助手经 ask 工具 interrupt({question}) 挂起等待
 * 补充输入,本卡替换输入区(中断期间禁言,防新消息打到悬空 tool_call 上)。
 * 提交经 useLangGraphSendCommand 回灌 Command({resume})——LangGraphCommand
 * 类型钉死 resume: string,与本仓后端 zod 完全同形。中断清位:resume run
 * 的首个普通 updates 帧会把中断状态置空,卡片随之消失、输入区回归。
 */
import {
  useLangGraphInterruptState,
  useLangGraphSendCommand,
} from "@assistant-ui/react-langgraph";
import { useState } from "react";

import { HelpCircle } from "lucide-react";

import { parseAskUserInterrupt } from "@/lib/assistant-wire/wire";

export function AssistantInterruptCard(): React.ReactElement | null {
  const interrupt = useLangGraphInterruptState();
  const sendCommand = useLangGraphSendCommand();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (interrupt === undefined) return null;
  const payload = parseAskUserInterrupt(interrupt.value);
  const question = payload?.question ?? "助手需要你的补充输入";

  const submit = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await sendCommand({ resume: text.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="border-t border-line p-3" aria-label="助手提问">
      <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-highlight">
        <HelpCircle className="size-3.5" aria-hidden />
        助手提问 · 等待你的回答
      </div>
      <p className="mb-2.5 text-sm leading-relaxed text-body">{question}</p>
      <form
        className="flex items-end gap-2 rounded-lg border border-line bg-panel-inset p-2 transition-colors focus-within:border-link"
        onSubmit={(e) => {
          e.preventDefault();
          const message = text.trim();
          if (message === "") return;
          void submit();
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="输入你的回答…"
          maxLength={4000}
          autoFocus
          disabled={submitting}
          className="min-h-[36px] flex-1 bg-transparent px-1.5 py-1.5 text-sm text-body placeholder:text-muted focus:outline-none disabled:opacity-40"
        />
        <button
          type="submit"
          disabled={submitting || text.trim() === ""}
          className="shrink-0 rounded-md bg-highlight-deep px-2.5 py-1 text-xs font-medium text-ink hover:bg-highlight-deep-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          发送
        </button>
      </form>
    </div>
  );
}
