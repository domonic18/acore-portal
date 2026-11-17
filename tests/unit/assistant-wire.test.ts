import { describe, expect, it } from "vitest";

import { createSseEventReader } from "@/lib/assistant-wire/sse";
import {
  newAssistantThreadId,
  parseApiErrorMessage,
  parseAskUserInterrupt,
  parseWireErrorMessage,
  updatesHasInterrupt,
} from "@/lib/assistant-wire/wire";

/**
 * 助手防腐层(W7)单测:SSE 帧解析(与后端 sseFrame 成对的逆变换)与
 * wire 契约纯函数(threadId 格式/中断载荷/错误信封人话)。
 */

const frame = (event: string, data: unknown): string =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("createSseEventReader", () => {
  it("整帧喂入:按序解出事件名与载荷", () => {
    const reader = createSseEventReader();
    const text =
      frame("metadata", { run_id: "r1" }) +
      frame("messages/partial", [{ type: "ai", content: "hi" }]) +
      frame("end", []);
    expect(reader.push(text)).toEqual([
      { event: "metadata", data: { run_id: "r1" } },
      { event: "messages/partial", data: [{ type: "ai", content: "hi" }] },
      { event: "end", data: [] },
    ]);
    expect(reader.end()).toEqual([]);
  });

  it("跨 chunk 字节切分:拆散的帧在后续 push 拼回", () => {
    const reader = createSseEventReader();
    const text = frame("updates", { __interrupt__: [{ id: "i1", value: { question: "q" } }] });
    const mid = Math.floor(text.length / 2);
    expect(reader.push(text.slice(0, mid))).toEqual([]);
    expect(reader.push(text.slice(mid))).toEqual([
      {
        event: "updates",
        data: { __interrupt__: [{ id: "i1", value: { question: "q" } }] },
      },
    ]);
  });

  it("非 JSON data 与纯 event 行丢弃,不中断后续帧", () => {
    const reader = createSseEventReader();
    const text = "event: junk\ndata: {broken\n\n" + frame("end", []);
    expect(reader.push(text)).toEqual([{ event: "end", data: [] }]);
  });

  it("end 兜住无尾随空行的最后一帧", () => {
    const reader = createSseEventReader();
    expect(reader.push('event: end\ndata: []')).toEqual([]);
    expect(reader.end()).toEqual([{ event: "end", data: [] }]);
    expect(reader.end()).toEqual([]);
  });
});

describe("wire 契约", () => {
  it("threadId 满足路由 zod 契约(/^[A-Za-z0-9-]{8,64}$/)", () => {
    const id = newAssistantThreadId();
    expect(id).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    expect(newAssistantThreadId()).not.toBe(id);
  });

  it("updatesHasInterrupt 只认 __interrupt__ 键", () => {
    expect(updatesHasInterrupt({ __interrupt__: [] })).toBe(true);
    expect(updatesHasInterrupt({ "node:name": {} })).toBe(false);
    expect(updatesHasInterrupt(null)).toBe(false);
    expect(updatesHasInterrupt("x")).toBe(false);
  });

  it("parseAskUserInterrupt 解出 question,形状不符返 null", () => {
    expect(parseAskUserInterrupt({ question: "补充一下?" })).toEqual({
      question: "补充一下?",
    });
    expect(parseAskUserInterrupt({ question: "  " })).toBeNull();
    expect(parseAskUserInterrupt({})).toBeNull();
    expect(parseAskUserInterrupt("q")).toBeNull();
  });

  it("error 帧与 apiError 信封取人话,缺损落兜底", () => {
    expect(parseWireErrorMessage({ message: "AI 通道异常" })).toBe("AI 通道异常");
    expect(parseWireErrorMessage({})).toBeNull();
    expect(parseApiErrorMessage({ error: { code: 429, message: "今日问答次数已用完" } }, 429)).toBe(
      "今日问答次数已用完",
    );
    expect(parseApiErrorMessage(null, 502)).toBe("请求失败(502)");
  });
});
