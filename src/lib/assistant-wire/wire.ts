/**
 * 助手 wire 契约收口(W7,零依赖纯函数,前后端语义对齐的客户端侧):
 * SSE 帧事件名、ask_user 中断载荷解析、threadId 生成。组件不手写字符串
 * 字面量,后端协议变更只动这里与 server/services/assistant/wire.ts。
 */

export const ASSISTANT_API_BASE = "/api/assistant";

/** SSE 帧事件名(与后端 run.ts 的 send 调用同源) */
export const WIRE_EVENTS = {
  metadata: "metadata",
  messages: "messages",
  updates: "updates",
  error: "error",
  end: "end",
} as const;

/** threadId 契约(路由 zod:/^[A-Za-z0-9-]{8,64}$/),客户端生成,新会话即新 id */
export function newAssistantThreadId(): string {
  return crypto.randomUUID();
}

/** updates 帧是否携带中断(langgraph 挂起时以 __interrupt__ 键入增量) */
export function updatesHasInterrupt(updates: unknown): boolean {
  return typeof updates === "object" && updates !== null && "__interrupt__" in updates;
}

/** ask_user 工具 interrupt 载荷(与 server/services/assistant/agent.ts 的 askUserTool 同构) */
export interface AssistantAskUserPayload {
  question: string;
}

/**
 * 从 interrupt 状态值解析 ask_user 载荷(useLangGraphInterruptState().value
 * → 提问卡数据)。形状不符返 null,调用方落通用兜底问句。
 */
export function parseAskUserInterrupt(value: unknown): AssistantAskUserPayload | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.question !== "string" || v.question.trim() === "") return null;
  return { question: v.question };
}

/** error 帧载荷(后端 catch 统一的人话) */
export function parseWireErrorMessage(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const message = (data as Record<string, unknown>).message;
  return typeof message === "string" && message !== "" ? message : null;
}

/** 非流式拒绝(401/429/503)的 apiError 信封({error:{code,message}})人话 */
export function parseApiErrorMessage(data: unknown, status: number): string {
  if (typeof data === "object" && data !== null) {
    const error = (data as Record<string, unknown>).error;
    if (typeof error === "object" && error !== null) {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message !== "") return message;
    }
  }
  return `请求失败(${status})`;
}
