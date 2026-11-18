import {
  BaseCheckpointSaver,
  JsonPlusSerializer,
  WRITES_IDX_MAP,
  compareWritesSortKeys,
  getCheckpointId,
  writesSortKey,
} from "@langchain/langgraph-checkpoint";
import type {
  Checkpoint,
  CheckpointListOptions,
  CheckpointMetadata,
  CheckpointTuple,
  PendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db/business";
import { deleteAssistantThread } from "@/server/services/assistant/session-cleanup";

/**
 * MySQL 检查点存取(M9 W5):对照 langgraph 官方 PostgresSaver/MemorySaver 语义移植。
 * - checkpoint/写值经 JsonPlusSerializer 序列化落 LONGBLOB(type 列回传 loadsTyped)
 * - metadata 恒为 JSON 可序列化对象(官方 PostgresSaver 同为 JSONB),直落 JSON 列
 * - pendingWrites 须按 writesSortKey(task_path, task_id, idx) 顺序返回——
 *   live 执行按该序套用同一 superstep 的写,顺序错了顺序敏感的 reducer 会重放出不同值
 * - 常规写(idx>=0)冲突不覆盖、错误写(idx<0)覆盖(MemorySaver 同语义)
 */
export class MysqlCheckpointSaver extends BaseCheckpointSaver {
  constructor() {
    super(new JsonPlusSerializer());
  }

  private static ns(config: RunnableConfig): string {
    return config.configurable?.checkpoint_ns ?? "";
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id;
    if (typeof threadId !== "string" || threadId === "") return undefined;
    const checkpointNs = MysqlCheckpointSaver.ns(config);
    const checkpointId = getCheckpointId(config);

    const row = checkpointId
      ? await prisma.agentCheckpoint.findUnique({
          where: {
            threadId_checkpointNs_checkpointId: {
              threadId,
              checkpointNs,
              checkpointId,
            },
          },
        })
      : // uuid6 字典序 = 时间序,MAX(checkpoint_id) 即最新
        await prisma.agentCheckpoint.findFirst({
          where: { threadId, checkpointNs },
          orderBy: { checkpointId: "desc" },
        });
    if (!row) return undefined;

    const checkpoint = (await this.serde.loadsTyped(
      row.type ?? "json",
      row.checkpoint,
    )) as Checkpoint;
    const pendingWrites = await this.pendingWrites(threadId, checkpointNs, row.checkpointId);
    const tuple: CheckpointTuple = {
      config,
      checkpoint,
      metadata: (row.metadata ?? undefined) as CheckpointMetadata | undefined,
      pendingWrites,
    };
    if (row.parentCheckpointId !== "") {
      tuple.parentConfig = {
        configurable: {
          thread_id: threadId,
          checkpoint_ns: checkpointNs,
          checkpoint_id: row.parentCheckpointId,
        },
      };
    }
    return tuple;
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { before, limit, filter } = options ?? {};
    const threadId = config.configurable?.thread_id;
    const checkpointNs = config.configurable?.checkpoint_ns;

    const rows = await prisma.agentCheckpoint.findMany({
      where: {
        ...(typeof threadId === "string" && threadId !== "" ? { threadId } : {}),
        ...(checkpointNs !== undefined ? { checkpointNs } : {}),
        ...(before?.configurable?.checkpoint_id
          ? { checkpointId: { lt: before.configurable.checkpoint_id } }
          : {}),
      },
      orderBy: { checkpointId: "desc" },
    });

    let remaining = limit;
    for (const row of rows) {
      const metadata = (row.metadata ?? undefined) as CheckpointMetadata | undefined;
      if (
        filter &&
        !Object.entries(filter).every(([k, v]) => (metadata as Record<string, unknown>)?.[k] === v)
      ) {
        continue;
      }
      if (remaining !== undefined) {
        if (remaining <= 0) break;
        remaining -= 1;
      }
      const checkpoint = (await this.serde.loadsTyped(
        row.type ?? "json",
        row.checkpoint,
      )) as Checkpoint;
      const tuple: CheckpointTuple = {
        config: {
          configurable: {
            thread_id: row.threadId,
            checkpoint_ns: row.checkpointNs,
            checkpoint_id: row.checkpointId,
          },
        },
        checkpoint,
        metadata,
        pendingWrites: await this.pendingWrites(row.threadId, row.checkpointNs, row.checkpointId),
      };
      if (row.parentCheckpointId !== "") {
        tuple.parentConfig = {
          configurable: {
            thread_id: row.threadId,
            checkpoint_ns: row.checkpointNs,
            checkpoint_id: row.parentCheckpointId,
          },
        };
      }
      yield tuple;
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: Record<string, number | string>,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id;
    if (typeof threadId !== "string" || threadId === "") {
      throw new Error("Failed to put checkpoint: missing thread_id in configurable");
    }
    const checkpointNs = MysqlCheckpointSaver.ns(config);
    const [type, bytes] = await this.serde.dumpsTyped(checkpoint);
    const jsonMetadata = metadata as unknown as Prisma.InputJsonValue;
    await prisma.agentCheckpoint.upsert({
      where: {
        threadId_checkpointNs_checkpointId: {
          threadId,
          checkpointNs,
          checkpointId: checkpoint.id,
        },
      },
      create: {
        threadId,
        checkpointNs,
        checkpointId: checkpoint.id,
        // 上一个检查点 = put 调用时 config 已指向的 checkpoint_id(首存为空串)
        parentCheckpointId: getCheckpointId(config) ?? "",
        type,
        checkpoint: Buffer.from(bytes),
        metadata: jsonMetadata,
      },
      // 对照官方语义:重放更新内容与 metadata,父链不变
      update: { type, checkpoint: Buffer.from(bytes), metadata: jsonMetadata },
    });
    return {
      configurable: { thread_id: threadId, checkpoint_ns: checkpointNs, checkpoint_id: checkpoint.id },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath?: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id;
    const checkpointId = config.configurable?.checkpoint_id;
    if (typeof threadId !== "string" || threadId === "" || typeof checkpointId !== "string") {
      throw new Error("Failed to put writes: missing thread_id/checkpoint_id in configurable");
    }
    const checkpointNs = MysqlCheckpointSaver.ns(config);
    for (const [i, [channel, value]] of writes.entries()) {
      const idx = WRITES_IDX_MAP[channel] || i;
      const [type, bytes] = await this.serde.dumpsTyped(value);
      await prisma.agentWrites.upsert({
        where: {
          threadId_checkpointNs_checkpointId_taskId_idx: {
            threadId,
            checkpointNs,
            checkpointId,
            taskId,
            idx,
          },
        },
        create: {
          threadId,
          checkpointNs,
          checkpointId,
          taskId,
          taskPath: taskPath ?? "",
          idx,
          channel,
          type,
          blob: Buffer.from(bytes),
        },
        // 常规写已存在=跳过(幂等重放),错误写覆盖
        update: idx < 0 ? { type, blob: Buffer.from(bytes), taskPath: taskPath ?? "" } : {},
      });
    }
  }

  /** 删除整个线程:委托会话生命周期原语(检查点 + 中间写 + 台账同一事务,唯一写路径) */
  async deleteThread(threadId: string): Promise<void> {
    await deleteAssistantThread(threadId);
  }

  /** 一次 superstep 的 pending writes,按 writesSortKey 序返回(校验对照 MemorySaver) */
  private async pendingWrites(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ): Promise<CheckpointTuple["pendingWrites"]> {
    const rows = await prisma.agentWrites.findMany({
      where: { threadId, checkpointNs, checkpointId },
    });
    const keyed = rows
      .map((row) => ({
        key: writesSortKey(row.taskPath, row.taskId, row.idx),
        row,
      }))
      .sort((a, b) => compareWritesSortKeys(a.key, b.key));
    return Promise.all(
      keyed.map(async ({ row }) => [
        row.taskId,
        row.channel,
        await this.serde.loadsTyped(row.type ?? "json", row.blob ?? Buffer.alloc(0)),
      ]),
    );
  }
}
