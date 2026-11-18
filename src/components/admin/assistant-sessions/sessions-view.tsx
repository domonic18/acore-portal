"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Fragment, useState } from "react";

import { FOCUS_RING } from "@/components/ui/admin-tokens";
import { Table, Td, Th, THead, Tr } from "@/components/ui/table";

/**
 * 后台「AI 对话」列表客户端岛:行内「查看对话」展开拉取 thread 消息时间线
 * (GET /api/admin/assistant-sessions/[threadId],checkpoint 反序列化只读)。
 * 日期已由页面层格式化为字符串(components 禁 import server)。
 */

export interface AssistantSessionViewRow {
  threadId: string;
  title: string;
  runs: number;
  promptTokens: number;
  completionTokens: number;
  tokens: number;
  user: string;
  userRole: string;
  createdAt: string;
  lastMessageAt: string;
}

interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
}

export function SessionsView({ items }: { items: AssistantSessionViewRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, ThreadMessage[]>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  async function toggle(threadId: string) {
    if (openId === threadId) {
      setOpenId(null);
      return;
    }
    setOpenId(threadId);
    if (messages[threadId]) return;
    setLoadingId(threadId);
    setErrorId(null);
    try {
      const res = await fetch(`/api/admin/assistant-sessions/${threadId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { messages?: ThreadMessage[] };
      setMessages((prev) => ({ ...prev, [threadId]: json.messages ?? [] }));
    } catch {
      setErrorId(threadId);
    } finally {
      setLoadingId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-[#22385a] px-6 py-10 text-center text-[#6482a3]">
        暂无会话记录,用户与助手对话后这里会出现台账。
      </p>
    );
  }

  return (
    <div data-testid="admin-assistant-sessions">
      <Table minWidth="min-w-[820px]">
      <THead>
        <Tr>
          <Th>用户</Th>
          <Th>首问(标题)</Th>
          <Th>提问数</Th>
          <Th>Tokens</Th>
          <Th>创建时间</Th>
          <Th>最近活动</Th>
          <Th>操作</Th>
        </Tr>
      </THead>
      <tbody>
        {items.map((r) => {
          const open = openId === r.threadId;
          return (
            <Fragment key={r.threadId}>
              <Tr>
                <Td className="whitespace-nowrap">
                  <span className="text-[#dcebf7]">{r.user || "已注销用户"}</span>
                  {r.userRole && (
                    <span className="ml-1.5 rounded border border-[#22385a] px-1.5 py-0.5 text-[10.5px] text-[#6482a3]">
                      {r.userRole}
                    </span>
                  )}
                </Td>
                <Td className="max-w-[280px]">
                  <span className="line-clamp-2 text-[#c4d9ec]">{r.title || "(无标题)"}</span>
                </Td>
                <Td className="whitespace-nowrap">{r.runs}</Td>
                <Td className="whitespace-nowrap text-[#e8c877]">{r.tokens}</Td>
                <Td className="whitespace-nowrap text-[12px] text-[#6482a3]">{r.createdAt}</Td>
                <Td className="whitespace-nowrap text-[12px] text-[#6482a3]">{r.lastMessageAt}</Td>
                <Td className="whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => toggle(r.threadId)}
                    aria-expanded={open}
                    aria-label={`${open ? "收起" : "查看"}会话「${r.title || r.threadId}」`}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-[12px] text-[#6fb7e0] transition hover:bg-[#13233a] hover:text-[#a8d9f5] ${FOCUS_RING}`}
                  >
                    {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {open ? "收起" : "对话"}
                  </button>
                </Td>
              </Tr>
              {open && (
                <Tr>
                  <Td colSpan={7} className="bg-[#0e1b2e]">
                    <div data-testid={`assistant-thread-${r.threadId}`} className="flex flex-col gap-2 px-1 py-1">
                      {loadingId === r.threadId && (
                        <p className="py-3 text-center text-[12.5px] text-[#6482a3]">对话加载中…</p>
                      )}
                      {errorId === r.threadId && (
                        <p role="alert" className="py-3 text-center text-[12.5px] text-[#eda9a9]">
                          对话加载失败,请稍后重试。
                        </p>
                      )}
                      {!(loadingId === r.threadId || errorId === r.threadId) &&
                        (messages[r.threadId]?.length ?? 0) === 0 && (
                          <p className="py-3 text-center text-[12.5px] text-[#6482a3]">
                            该会话暂无可读消息(checkpoint 缺失或仅含系统帧)。
                          </p>
                        )}
                      {messages[r.threadId]?.map((m, i) => (
                        <div
                          key={i}
                          className={`max-w-[85%] rounded-lg px-3 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                            m.role === "user"
                              ? "self-end bg-[#1d3a5f] text-[#dcebf7]"
                              : "self-start border border-[#22385a] bg-[#13233a] text-[#c4d9ec]"
                          }`}
                        >
                          <span className="mb-1 block text-[10.5px] font-semibold text-[#6482a3]">
                            {m.role === "user" ? "用户" : "小塔"}
                          </span>
                          {m.content}
                        </div>
                      ))}
                    </div>
                  </Td>
                </Tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
    </div>
  );
}
