/**
 * AI 助手常量(会话数据生命周期口径):
 *
 * 助手对话的正文存在 LangGraph 检查点表(agent_checkpoint / agent_writes),
 * 每轮问答落一份全量状态快照 ⇒ 单个会话的存储随轮次呈平方增长。
 * 长期不清理会让业务库被助手会话撑爆(2026-11-18 存储健康度排查结论),
 * 故定「会话保留期 + 到期清理」:超期会话连同检查点与台账行一并删除。
 *
 * 锚点取 assistant_session.last_message_at(最近活动时刻,已有索引):
 * 近期有活动的会话不清理,沉睡会话才回收。
 */

/**
 * 会话保留天数:超期(最近活动早于该天数)的会话被自动清理。
 * 30 天 = 覆盖月度使用周期,又不让沉睡会话长期占库。
 */
export const ASSISTANT_SESSION_RETENTION_DAYS = 30;

/** 自动清理任务的单批上限(会话数):避免一次事务过大拖长锁持有时间 */
export const ASSISTANT_SESSION_PRUNE_BATCH_LIMIT = 200;
