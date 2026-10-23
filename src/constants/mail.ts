/** 邮件域常量(M1 三模板,research R7) */
export const MAIL_TEMPLATE = {
  ACTIVATE: "activate",
  PASSWORD_RESET: "password_reset",
  EMAIL_CHANGE: "email_change",
} as const;

export type MailTemplateValue =
  (typeof MAIL_TEMPLATE)[keyof typeof MAIL_TEMPLATE];

/** 重发限速(FR-010):≥60s 间隔、≤5 次/天 */
export const MAIL_RESEND_MIN_INTERVAL_SEC = 60;
export const MAIL_RESEND_DAILY_MAX = 5;
