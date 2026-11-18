import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { ASSISTANT_SESSION_RETENTION_DAYS } from "@/constants/assistant";

/**
 * 助手会话生命周期守卫(2026-11-18 存储健康度整改):
 *
 * 助手对话正文存在 LangGraph 检查点表(每轮落一份全量状态快照)⇒ 单会话存储
 * 随轮次平方增长,不回收会让业务库被沉睡会话撑爆。故定:
 * ① 保留期锚点 = assistant_session.last_message_at(有索引,不必给检查点表加列);
 * ② 删除路径唯一 —— 后台手动删除与周频自动清理共用服务层原语,
 *    禁在别处另写一套删检查点的逻辑(两条路径迟早漂移)。
 */

const SRC_ROOT = path.resolve(process.cwd(), "src");
const ROOT = path.resolve(process.cwd());

/** 唯一写路径:会话生命周期原语 */
const DELETE_PRIMITIVE = path.join(
  SRC_ROOT,
  "server",
  "services",
  "assistant",
  "session-cleanup.ts",
);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const read = (rel: string): string => readFileSync(path.resolve(ROOT, rel), "utf8");

describe("助手会话保留期", () => {
  it("保留期为 30 天(沉睡会话回收口径)", () => {
    expect(ASSISTANT_SESSION_RETENTION_DAYS).toBe(30);
  });

  it("清理脚本复用服务层原语,自带删除逻辑即违规", () => {
    const cron = read("scripts/cron/assistant-cleanup.ts");
    expect(cron).toContain("pruneExpiredAssistantSessions");
    expect(cron).not.toMatch(
      /agentCheckpoint\.deleteMany|agentWrites\.deleteMany|assistantSession\.deleteMany/,
    );
  });

  it("宿主编排脚本随发布资产下发(宿主与镜像同 commit)", () => {
    expect(read("scripts/ci/remote-release.sh")).toContain(
      "scripts/cron/assistant-cleanup-run.sh",
    );
  });
});

describe("助手会话删除路径唯一", () => {
  it("全仓只有会话生命周期原语删检查点/中间写/台账", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file === DELETE_PRIMITIVE) continue;
      const source = readFileSync(file, "utf8");
      if (
        /agentCheckpoint\.deleteMany|agentWrites\.deleteMany|assistantSession\.deleteMany/.test(
          source,
        )
      ) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("检查点保存器不自带删除实现(委托原语)", () => {
    const saver = read(
      "src/server/services/assistant/checkpointer/mysql-saver.ts",
    );
    expect(saver).toContain("deleteAssistantThread");
    expect(saver).not.toContain("agentCheckpoint.deleteMany");
  });
});
