/** user_token 用途与有效期(research R11) */
export const TOKEN_TYPE = {
  ACTIVATE: "activate",
  PASSWORD_RESET: "password_reset",
  EMAIL_CHANGE: "email_change",
} as const;

export type TokenTypeValue = (typeof TOKEN_TYPE)[keyof typeof TOKEN_TYPE];

/** 有效期(秒):激活 24h / 重置 30min / 换邮箱 24h */
export const TOKEN_TTL_SECONDS: Record<TokenTypeValue, number> = {
  activate: 24 * 60 * 60,
  password_reset: 30 * 60,
  email_change: 24 * 60 * 60,
};
