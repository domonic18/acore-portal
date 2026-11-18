/**
 * 助手会话超期清理(cron,周频):回收超过保留期的沉睡会话。
 *
 * 助手对话正文存在 LangGraph 检查点表(每轮落全量状态快照)⇒ 单会话存储随轮次
 * 平方增长;沉睡会话不回收,业务库会被慢慢撑爆(2026-11-18 存储健康度排查)。
 *
 * 保留期锚点:assistant_session.last_message_at(最近活动时刻)。
 * 清理口径与后台手动删除共用同一个服务原语(services/assistant/session-cleanup),
 * 禁在此另写一套删除逻辑。
 *
 * 结果同步飞书:任务无人值守,跑没跑/回收多少/有没有失败站内看不出来。
 * 告警通道故障只记日志,绝不连带清理失败(沿用运维告警降级口径)。
 *
 * 用法:tsx --conditions=react-server scripts/cron/assistant-cleanup.ts
 */
import { ASSISTANT_SESSION_RETENTION_DAYS } from "../../src/constants/assistant";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";
import { getConfig } from "../../src/lib/config";
import {
  pruneExpiredAssistantSessions,
  type AssistantPruneResult,
} from "../../src/server/services/assistant/session-cleanup";
import { writeAudit } from "../../src/server/services/shared/audit";
import {
  buildAssistantCleanupCard,
  buildAssistantCleanupFailureCard,
} from "./assistant-cleanup-alert";
import { describeAlert, sendOpsAlert, type OpsAlertOutcome } from "./ops-alert";
import type { FeishuCard } from "../../src/server/services/shared/feishu-card";

/** 发卡片;通道未配置/故障一律降级为只记日志(取不到配置也算通道故障) */
async function syncCard(
  build: () => FeishuCard,
  fallback: OpsAlertOutcome,
): Promise<OpsAlertOutcome> {
  try {
    const cfg = await getConfig();
    return await sendOpsAlert(cfg, build());
  } catch (err) {
    console.error(
      `[assistant-cleanup] 同步卡片失败:${err instanceof Error ? err.message : String(err)}`,
    );
    return fallback;
  }
}

async function main() {
  let result: AssistantPruneResult;
  try {
    result = await pruneExpiredAssistantSessions({
      retentionDays: ASSISTANT_SESSION_RETENTION_DAYS,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[assistant-cleanup] 失败: ${message}`);
    const outcome = await syncCard(
      () => buildAssistantCleanupFailureCard({ reason: message }),
      "failed",
    );
    console.error(`[assistant-cleanup] 失败卡片:${describeAlert(outcome)}`);
    process.exitCode = 1;
    return;
  }

  if (result.threads > 0) {
    await writeAudit({
      category: AUDIT_CATEGORY.ADMIN,
      action: AUDIT_ACTION.ASSISTANT_SESSIONS_PRUNED,
      payload: {
        retentionDays: result.retentionDays,
        cutoff: result.cutoff,
        threads: result.threads,
        rows: result.rows,
      },
    });
  }

  console.log(
    `[assistant-cleanup] 保留期 ${result.retentionDays} 天:回收 ${result.threads} 个会话(${result.rows} 行)`,
  );

  const outcome = await syncCard(
    () =>
      buildAssistantCleanupCard({
        threads: result.threads,
        rows: result.rows,
        retentionDays: result.retentionDays,
        cutoff: result.cutoff,
      }),
    "failed",
  );
  console.log(`[assistant-cleanup] 同步卡片:${describeAlert(outcome)}`);
}

void main().catch(async (err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[assistant-cleanup] 失败: ${message}`);
  const outcome = await syncCard(
    () => buildAssistantCleanupFailureCard({ reason: message }),
    "failed",
  );
  console.error(`[assistant-cleanup] 失败卡片:${describeAlert(outcome)}`);
  process.exitCode = 1;
});
