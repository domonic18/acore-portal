/** 论坛域常量(M3):状态标签中文映射(Q3 字段化);论坛完全只读(Q1),无发帖常量 */
export const THREAD_STATUS_LABEL = {
  none: "",
  standard: "规范",
  resolved: "已解决",
  closed: "已关闭",
} as const;

export type ThreadStatusLabelValue =
  (typeof THREAD_STATUS_LABEL)[keyof typeof THREAD_STATUS_LABEL];

/** 可经 label 接口流转的标签(closed 仅经 close 操作产生,见 contracts/api-forum.md) */
export const THREAD_LABEL_OPTIONS = ["none", "standard", "resolved"] as const;

export const FORUM_PAGE_SIZE = 20;
