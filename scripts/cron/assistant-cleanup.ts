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
 * 用法:tsx --conditions=react-server scripts/cron/assistant-cleanup.ts
 */
import { ASSISTANT_SESSION_RETENTION_DAYS } from "../../src/constants/assistant";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";
import { pruneExpiredAssistantSessions } from "../../src/server/services/assistant/session-cleanup";
import { writeAudit } from "../../src/server/services/shared/audit";

async function main() {
  const result = await pruneExpiredAssistantSessions({
    retentionDays: ASSISTANT_SESSION_RETENTION_DAYS,
  });

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
}

void main().catch((err) => {
  console.error(
    `[assistant-cleanup] 失败: ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exitCode = 1;
});
