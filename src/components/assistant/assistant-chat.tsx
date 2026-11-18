"use client";
/**
 * 助手会话主面(W7,右下角抽屉与 /search 问答页共用):消息流
 * (MessagePrimitive,正文 react-markdown 受约束渲染——默认不执行 raw HTML,
 * urlTransform 剥危险协议)、运行中跳动点、流式光标、ask_user 中断卡替换
 * 输入区、护栏拒绝横幅(adapter onError 上抛的人话)。必须在
 * AssistantRuntimeProvider 内使用。
 */
import {
  AuiIf,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { Bot, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";

import { AssistantInterruptCard } from "./interrupt-card";

/** 聊天场景紧凑排版(对齐 constants/content.ts 的正文 token,气泡内缩距) */
const ANSWER_MARKDOWN_CLS = [
  "text-sm leading-[1.8] text-body [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
  "[&_h1]:mt-4 [&_h1]:text-base [&_h1]:font-bold [&_h1]:text-heading",
  "[&_h2]:mt-4 [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-heading",
  "[&_h3]:mt-3 [&_h3]:font-bold [&_h3]:text-heading",
  "[&_p]:my-2 [&_strong]:text-heading",
  "[&_a]:text-link [&_a:hover]:text-highlight [&_a]:underline [&_a]:decoration-link/40 [&_a:hover]:decoration-highlight",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5",
  "[&_li::marker]:text-link",
  "[&_code]:rounded [&_code]:bg-panel-inset [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-num",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-panel-inset [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_blockquote]:border-l-[3px] [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted",
  "[&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-line [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-line [&_th]:bg-panel-inset [&_th]:px-2 [&_th]:py-1",
].join(" ");

/** 站内相对链接当前页跳转;外链新窗打开 */
function MarkdownLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  const external = typeof href === "string" && /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      {...(external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
    >
      {children}
    </a>
  );
}

function AnswerText({ text }: { text: string }): React.ReactElement {
  return (
    <div className={`min-w-0 ${ANSWER_MARKDOWN_CLS}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        components={{ a: MarkdownLink }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function UserMessage(): React.ReactElement {
  return (
    <MessagePrimitive.Root className="mb-4 flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-highlight-deep px-3.5 py-2 text-sm leading-[1.7] text-ink">
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage(): React.ReactElement {
  return (
    <MessagePrimitive.Root className="mb-4">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
        <Bot className="size-3.5 text-highlight" aria-hidden />
        小塔助手
      </div>
      <div className="min-w-0 space-y-1">
        <MessagePrimitive.Content
          components={{ Text: ({ text }) => <AnswerText text={text ?? ""} /> }}
        />
        {/* 流式生成中的闪烁光标 */}
        <AuiIf condition={(s) => s.message.status?.type === "running"}>
          <span
            className="ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-pulse rounded-sm bg-highlight/80"
            aria-label="正在生成"
          />
        </AuiIf>
        {/* wire error 帧 → 末条 AI 消息 incomplete:人话提示(细节在横幅) */}
        <AuiIf condition={(s) => s.message.status?.type === "incomplete"}>
          <div className="mt-1.5 text-xs text-warn">响应已中断,可重试或换个问法</div>
        </AuiIf>
      </div>
    </MessagePrimitive.Root>
  );
}

function TypingIndicator(): React.ReactElement | null {
  return (
    <ThreadPrimitive.If running>
      <div className="mb-4" aria-label="助手正在处理">
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 animate-bounce rounded-full bg-muted"
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </div>
      </div>
    </ThreadPrimitive.If>
  );
}

function EmptyState(): React.ReactElement {
  return (
    <div className="py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl border border-line bg-panel-inset">
        <Sparkles className="size-6 text-highlight" aria-hidden />
      </div>
      <p className="mt-4 text-sm font-medium text-heading">问点什么吧</p>
      <p className="mt-1.5 text-xs leading-relaxed text-muted">
        攻略 / 使用说明 / 商城商品 / 论坛帖子都可以问
        <br />
        回答会附上站内来源链接
      </p>
    </div>
  );
}

export interface AssistantChatProps {
  banner?: string | null;
  onDismissBanner?: () => void;
  className?: string;
}

export function AssistantChat({
  banner,
  onDismissBanner,
  className = "",
}: AssistantChatProps): React.ReactElement {
  const showBanner = typeof banner === "string" && banner !== "";
  return (
    <ThreadPrimitive.Root className={`flex h-full min-h-0 flex-col ${className}`}>
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 py-4">
        <ThreadPrimitive.Empty>
          <EmptyState />
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        <TypingIndicator />
      </ThreadPrimitive.Viewport>
      {showBanner && (
        <div
          role="alert"
          className="border-t border-warn-line bg-warn-bg px-4 py-2 text-xs text-warn"
        >
          <span>{banner}</span>
          {onDismissBanner && (
            <button
              type="button"
              onClick={onDismissBanner}
              className="float-right ml-2 text-warn/70 hover:text-warn"
              aria-label="关闭提示"
            >
              ×
            </button>
          )}
        </div>
      )}
      <AssistantInterruptCard />
      <Composer />
    </ThreadPrimitive.Root>
  );
}

function Composer(): React.ReactElement {
  return (
    <ComposerPrimitive.Root className="border-t border-line p-3">
      <div className="flex items-end gap-2 rounded-lg border border-line bg-panel-inset p-2 transition-colors focus-within:border-link">
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="输入问题,回车发送…"
          className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm text-body placeholder:text-muted focus:outline-none"
        />
        <div className="flex shrink-0 items-center gap-1 pb-0.5 pr-0.5">
          <ThreadPrimitive.If running>
            <ComposerPrimitive.Cancel className="rounded-md border border-danger/40 px-2.5 py-1 text-xs text-danger hover:bg-danger/10">
              停止
            </ComposerPrimitive.Cancel>
          </ThreadPrimitive.If>
          <ThreadPrimitive.If running={false}>
            <ComposerPrimitive.Send className="rounded-md bg-highlight-deep px-2.5 py-1 text-xs font-medium text-ink hover:bg-highlight-deep-hover disabled:cursor-not-allowed disabled:opacity-40">
              发送
            </ComposerPrimitive.Send>
          </ThreadPrimitive.If>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}
