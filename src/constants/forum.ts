/**
 * 论坛域常量(M3):状态标签中文映射(Q3 字段化)
 *
 * 状态取值与 forum_thread.status_label 枚举一一对应(单一真相源):
 *   none        —— 无标签
 *   resolved    —— 已解决
 *   needs_info  —— 请补充(版主提示发帖人补充更多信息,站内信通知作者)
 *   in_progress —— 处理中(版主已受理,正在跟进/等待修复排期)
 *   closed      —— 已关闭(不可回帖;closed_at 同步落关闭时间)
 */
export const THREAD_STATUS_LABEL = {
  none: "",
  resolved: "已解决",
  needs_info: "请补充",
  in_progress: "处理中",
  closed: "已关闭",
} as const;

/** 状态取值(键)联合类型 */
export type ThreadStatusLabelValue = keyof typeof THREAD_STATUS_LABEL;

/** 可经 label 接口流转的标签(含 closed:状态下拉即可关闭主题,关闭后禁回帖) */
export const THREAD_LABEL_OPTIONS = [
  "none",
  "resolved",
  "needs_info",
  "in_progress",
  "closed",
] as const;

/** 状态标签中文名(下拉展示;none 在下拉显示「无标签」,徽标侧空串即不显示) */
export const THREAD_STATUS_TEXT: Record<ThreadStatusLabelValue, string> = {
  ...THREAD_STATUS_LABEL,
  none: "无标签",
};

/**
 * 版块列表筛选 tab(Discuz 口径):最新=最近活动(默认,置顶恒先)/
 * 热门=浏览量/热帖=回复量/精华=仅加精。URL 形态 ?filter=<key>。
 */
export const FORUM_BOARD_TABS = [
  { key: "latest", label: "最新" },
  { key: "hot", label: "热门" },
  { key: "replies", label: "热帖" },
  { key: "featured", label: "精华" },
] as const;

export type ForumBoardTabKey = (typeof FORUM_BOARD_TABS)[number]["key"];

/** 热帖角标阈值:回复数达到即显示 🔥(行业惯例 10 楼开外算热) */
export const FORUM_HOT_REPLY_THRESHOLD = 10;

/** 「新」角标窗口:最近回复距现在不足该时长(小时)即显示 */
export const FORUM_NEW_REPLY_WINDOW_HOURS = 24;
