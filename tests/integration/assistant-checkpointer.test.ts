import { afterAll, describe, expect, it } from "vitest";

import type { Checkpoint } from "@langchain/langgraph-checkpoint";

import { prisma } from "@/lib/db/business";
import { MysqlCheckpointSaver } from "@/server/services/assistant/checkpointer/mysql-saver";

/**
 * MySQL 检查点存取(M9 W5)集成:对照 MemorySaver 语义锚死
 * put/getTuple 往返与父链 / 最新取值 / putWrites 排序·幂等·错误写覆盖 /
 * list 的 before·limit·metadata 过滤 / 线程隔离 / deleteThread。
 */

const PREFIX = `test-ckpt-${Date.now().toString(36)}`;
const saver = new MysqlCheckpointSaver();

function ckpt(id: string, values: Record<string, unknown>): Checkpoint {
  return {
    v: 4,
    id,
    ts: new Date().toISOString(),
    channel_values: values,
    channel_versions: { __root__: String(values ? 1 : 0) },
    versions_seen: { __start__: {} },
  };
}

const cfg = (threadId: string, checkpointId?: string) => ({
  configurable: {
    thread_id: threadId,
    checkpoint_ns: "",
    ...(checkpointId ? { checkpoint_id: checkpointId } : {}),
  },
});

async function cleanup() {
  await prisma.agentWrites.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
  await prisma.agentCheckpoint.deleteMany({ where: { threadId: { startsWith: PREFIX } } });
}

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("MysqlCheckpointSaver", () => {
  it("put → getTuple 往返:值/metadata/父链成环,无 checkpoint_id 取最新", async () => {
    const thread = `${PREFIX}-roundtrip`;
    const saved1 = await saver.put(cfg(thread), ckpt("19000000-0000-0000-0000-000000000001", {
      messages: [{ role: "user", content: "你好" }],
    }), { source: "input", step: -1, parents: {} }, {});
    expect(saved1.configurable?.checkpoint_id).toBe("19000000-0000-0000-0000-000000000001");

    // 第二次 put:config 指向 c1 ⇒ c2 的父链指向 c1
    await saver.put(cfg(thread, "19000000-0000-0000-0000-000000000001"), ckpt("19000000-0000-0000-0000-000000000002", {
      messages: [{ role: "user", content: "你好" }, { role: "assistant", content: "你好!" }],
    }), { source: "loop", step: 1, parents: {} }, {});

    const latest = await saver.getTuple(cfg(thread));
    expect(latest?.checkpoint.id).toBe("19000000-0000-0000-0000-000000000002");
    expect(latest?.checkpoint.channel_values.messages).toHaveLength(2);
    expect(latest?.metadata).toMatchObject({ source: "loop", step: 1, parents: {} });
    expect(latest?.parentConfig?.configurable?.checkpoint_id).toBe(
      "19000000-0000-0000-0000-000000000001",
    );

    // 按点名取旧检查点
    const old = await saver.getTuple(cfg(thread, "19000000-0000-0000-0000-000000000001"));
    expect(old?.checkpoint.channel_values.messages).toHaveLength(1);
    expect(old?.parentConfig).toBeUndefined();
    expect(old?.pendingWrites).toEqual([]);
  });

  it("putWrites:常规写不覆盖、错误写覆盖;按 (task_path, task_id, idx) 排序返回", async () => {
    const thread = `${PREFIX}-writes`;
    const id = "19000000-0000-0000-0000-000000000010";
    await saver.put(cfg(thread), ckpt(id, {}), { source: "loop", step: 0, parents: {} }, {});
    const writeCfg = cfg(thread, id);

    // task-b 无 path(排序前),task-a 有 path;无 path 的排最前
    await saver.putWrites(writeCfg, [["messages", "from-b"]], "task-b");
    await saver.putWrites(writeCfg, [["messages", "from-a"]], "task-a", "agent:1");
    // 同 task 两个 channel:idx 按传入序
    await saver.putWrites(writeCfg, [["messages", "first"], ["__root__", "second"]], "task-c");

    // 重放同一常规写 → 不覆盖(值保持第一次)
    await saver.putWrites(writeCfg, [["messages", "SHOULD-NOT-OVERWRITE"]], "task-b");
    // 错误写 → 覆盖(idx=-1,同一 task 重复失败以最后一次为准)
    await saver.putWrites(writeCfg, [["__error__", "boom-1"]], "task-e");
    await saver.putWrites(writeCfg, [["__error__", "boom-2"]], "task-e");

    const tuple = await saver.getTuple(writeCfg);
    const pw = tuple?.pendingWrites ?? [];
    // 排序键 (task_path, task_id, idx):无 path("")的 b/c/e 先于有 path("agent:1")的 a
    expect(pw.map(([, channel]) => channel)).toEqual([
      "messages",
      "messages",
      "__root__",
      "__error__",
      "messages",
    ]);
    expect(pw.map(([, , value]) => value)).toEqual([
      "from-b",
      "first",
      "second",
      "boom-2",
      "from-a",
    ]);
    expect(pw.map(([taskId]) => taskId)).toEqual(["task-b", "task-c", "task-c", "task-e", "task-a"]);
  });

  it("list:before/limit/metadata 过滤三开关", async () => {
    const thread = `${PREFIX}-list`;
    for (const id of ["19000000-0000-0000-0000-000000000001", "19000000-0000-0000-0000-000000000002", "19000000-0000-0000-0000-000000000003"]) {
      await saver.put(cfg(thread), ckpt(id, {}), { source: id.endsWith("2") ? "loop" : "input", step: 0, parents: {} }, {});
    }

    // 最新在前
    const all = await saver.list(cfg(thread));
    const ids: string[] = [];
    for await (const t of all) ids.push(t.checkpoint.id);
    expect(ids).toEqual([
      "19000000-0000-0000-0000-000000000003",
      "19000000-0000-0000-0000-000000000002",
      "19000000-0000-0000-0000-000000000001",
    ]);

    // before:不含边界
    const before = await saver.list(cfg(thread), {
      before: { configurable: { checkpoint_id: "19000000-0000-0000-0000-000000000003" } },
    });
    const beforeIds: string[] = [];
    for await (const t of before) beforeIds.push(t.checkpoint.id);
    expect(beforeIds).toEqual([
      "19000000-0000-0000-0000-000000000002",
      "19000000-0000-0000-0000-000000000001",
    ]);

    // limit:取 1 条
    const one = await saver.list(cfg(thread), { limit: 1 });
    const oneIds: string[] = [];
    for await (const t of one) oneIds.push(t.checkpoint.id);
    expect(oneIds).toEqual(["19000000-0000-0000-0000-000000000003"]);

    // filter:metadata 匹配
    const loopOnly = await saver.list(cfg(thread), { filter: { source: "loop" } });
    const loopIds: string[] = [];
    for await (const t of loopOnly) loopIds.push(t.checkpoint.id);
    expect(loopIds).toEqual(["19000000-0000-0000-0000-000000000002"]);
  });

  it("线程隔离与 deleteThread:互不可见,删除清两表", async () => {
    const t1 = `${PREFIX}-iso-1`;
    const t2 = `${PREFIX}-iso-2`;
    await saver.put(cfg(t1), ckpt("19000000-0000-0000-0000-000000000001", { v: 1 }), { source: "input", step: -1, parents: {} }, {});
    await saver.put(cfg(t2), ckpt("19000000-0000-0000-0000-000000000002", { v: 2 }), { source: "input", step: -1, parents: {} }, {});
    expect((await saver.getTuple(cfg(t1)))?.checkpoint.channel_values.v).toBe(1);
    expect((await saver.getTuple(cfg(t2)))?.checkpoint.channel_values.v).toBe(2);

    await saver.putWrites(cfg(t1, "19000000-0000-0000-0000-000000000001"), [["messages", "w"]], "task-x");
    await saver.deleteThread(t1);
    expect(await saver.getTuple(cfg(t1))).toBeUndefined();
    expect((await prisma.agentWrites.findMany({ where: { threadId: t1 } })).length).toBe(0);
    expect(await saver.getTuple(cfg(t2))).toBeDefined();
  });
});
