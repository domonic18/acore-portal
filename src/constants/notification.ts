/** 通知域常量:未读徽标轮询与新消息提示 */

export const UNREAD_POLL_INTERVAL_MS = 60_000;

/** 新消息提示条自动消失时长 */
export const UNREAD_TOAST_MS = 8_000;

/**
 * 站内信类型(notification.type 列,VarChar(32),新增类型无需 DDL)。
 * 积分入账/扣减与安全告警分属不同语义,收件箱按统一类型过滤。
 */
export const NOTIFICATION_TYPE = {
  POINTS: "points",
  SECURITY: "security",
} as const;

export type NotificationTypeValue =
  (typeof NOTIFICATION_TYPE)[keyof typeof NOTIFICATION_TYPE];
