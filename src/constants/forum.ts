/**
 * 论坛域常量(M3):状态标签中文映射(Q3 字段化)
 *
 * 状态取值与 forum_thread.status_label 枚举一一对应(单一真相源):
 *   none       —— 无标签
 *   resolved   —— 已解决
 *   needs_info —— 请补充(版主提示发帖人补充更多信息,站内信通知作者)
 *   closed     —— 已关闭(不可回帖;closed_at 同步落关闭时间)
 */
export const THREAD_STATUS_LABEL = {
  none: "",
  resolved: "已解决",
  needs_info: "请补充",
  closed: "已关闭",
} as const;

/** 状态取值(键)联合类型 */
export type ThreadStatusLabelValue = keyof typeof THREAD_STATUS_LABEL;

/** 可经 label 接口流转的标签(含 closed:状态下拉即可关闭主题,关闭后禁回帖) */
export const THREAD_LABEL_OPTIONS = [
  "none",
  "resolved",
  "needs_info",
  "closed",
] as const;

/** 状态标签中文名(下拉展示;none 在下拉显示「无标签」,徽标侧空串即不显示) */
export const THREAD_STATUS_TEXT: Record<ThreadStatusLabelValue, string> = {
  ...THREAD_STATUS_LABEL,
  none: "无标签",
};
