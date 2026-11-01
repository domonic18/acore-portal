/** 邮件域常量(M1 三模板+M4 积分通知,research R7/R4) */
export const MAIL_TEMPLATE = {
  ACTIVATE: "activate",
  PASSWORD_RESET: "password_reset",
  EMAIL_CHANGE: "email_change",
  /** M4 积分变动阈值通知(无一次性链接,payload {username,delta,balance,reason}) */
  POINTS_NOTIFY: "points_notify",
} as const;

export type MailTemplateValue =
  (typeof MAIL_TEMPLATE)[keyof typeof MAIL_TEMPLATE];

/** 邮件 outbox 状态机(research R7):pending → sent,投递失败落 failed 可重发 */
export const MAIL_STATUS = {
  PENDING: "pending",
  SENT: "sent",
  FAILED: "failed",
} as const;

export type MailStatusValue = (typeof MAIL_STATUS)[keyof typeof MAIL_STATUS];

/** 重发限速(FR-010):≥60s 间隔、≤5 次/天 */
export const MAIL_RESEND_MIN_INTERVAL_SEC = 60;
export const MAIL_RESEND_DAILY_MAX = 5;
