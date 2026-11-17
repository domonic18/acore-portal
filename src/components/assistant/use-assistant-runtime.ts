"use client";
/**
 * 助手会话运行时 hook(W7):threadId 客户端生成(受控 state + ref 双持,
 * adapter 经 getter 读当前值防 useMemo 闭包过期)、新会话重置、错误横幅
 * 状态收口。Drawer 与 /search 页各调一次,互不共享会话。
 */
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { useCallback, useMemo, useRef, useState } from "react";

import { createAssistantAdapter } from "@/lib/assistant-wire/runtime-adapter";
import { newAssistantThreadId } from "@/lib/assistant-wire/wire";

export function useAssistantRuntime() {
  const [threadId, setThreadId] = useState(() => newAssistantThreadId());
  const threadIdRef = useRef(threadId);
  const [banner, setBanner] = useState<string | null>(null);

  const startNewThread = useCallback(() => {
    const id = newAssistantThreadId();
    threadIdRef.current = id;
    setThreadId(id);
    setBanner(null);
  }, []);

  const onError = useCallback((message: string) => setBanner(message), []);

  const adapter = useMemo(
    () =>
      createAssistantAdapter({
        getThreadId: () => threadIdRef.current,
        onError,
      }),
    [onError],
  );

  const runtime = useLangGraphRuntime({
    threadId,
    stream: adapter.stream,
    unstable_threadListAdapter: adapter.threadListAdapter,
    eventHandlers: adapter.eventHandlers,
    unstable_allowCancellation: true,
  });

  return { runtime, threadId, banner, clearBanner: () => setBanner(null), startNewThread };
}
