import { afterAll, describe, expect, it } from "vitest";

import { Annotation, Command, END, interrupt, START, StateGraph } from "@langchain/langgraph";

import { prisma } from "@/lib/db/business";
import { MysqlCheckpointSaver } from "@/server/services/assistant/checkpointer/mysql-saver";

/**
 * 真实 LangGraph 运行时闭环(M9 W5):MySQL checkpointer 挂进 StateGraph,
 * 动态 interrupt 中断 → 状态落库 → Command(resume) 续跑——HITL 的存取闭环。
 * 不依赖 LLM(节点为纯函数)。
 */

const PREFIX = `test-lg-${Date.now().toString(36)}`;

const AgentState = Annotation.Root({
  foo: Annotation<string>,
});

function buildGraph() {
  const step = async (state: typeof AgentState.State) => {
    const answer = interrupt("请补充信息");
    return { foo: `${state.foo}+${answer}` };
  };
  return new StateGraph(AgentState)
    .addNode("step", step)
    .addEdge(START, "step")
    .addEdge("step", END)
    .compile({ checkpointer: new MysqlCheckpointSaver() });
}

afterAll(async () => {
  await prisma.agentWrites.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.agentCheckpoint.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.$disconnect();
});

describe("LangGraph + MySQL checkpointer 闭环", () => {
  it("interrupt 落库 → resume 续跑 → getState 读回终态", async () => {
    const graph = buildGraph();
    const thread = { configurable: { thread_id: `${PREFIX}-hitl` } };

    // 第一段:跑进 interrupt,即停
    const run1 = await graph.invoke({ foo: "a" }, thread);
    const interrupts = (run1 as { __interrupt__?: { value: unknown }[] }).__interrupt__;
    expect(interrupts).toHaveLength(1);
    expect(interrupts?.[0]?.value).toBe("请补充信息");

    // 中断态已持久化:新 graph 实例(模拟下一请求)读回同一状态
    const reloaded = buildGraph();
    const state = await reloaded.getState(thread);
    expect(state.values.foo).toBe("a");
    expect(state.next).toEqual(["step"]);

    // 续跑:resume 值进节点,状态推进到终态
    const run2 = await reloaded.invoke(new Command({ resume: "b" }), thread);
    expect(run2.foo).toBe("a+b");
    const final = await reloaded.getState(thread);
    expect(final.values.foo).toBe("a+b");
    expect(final.next).toEqual([]);
  });

  it("线程隔离:同一 graph 两线程各自成链,互不可见", async () => {
    const graph = buildGraph();
    const t1 = { configurable: { thread_id: `${PREFIX}-iso-1` } };
    const t2 = { configurable: { thread_id: `${PREFIX}-iso-2` } };

    const run1 = await graph.invoke({ foo: "x" }, t1);
    expect((run1 as { __interrupt__?: unknown[] }).__interrupt__).toHaveLength(1);
    const run2 = await graph.invoke({ foo: "y" }, t2);
    expect((run2 as { __interrupt__?: unknown[] }).__interrupt__).toHaveLength(1);

    expect((await graph.getState(t1)).values.foo).toBe("x");
    expect((await graph.getState(t2)).values.foo).toBe("y");
  });
});
