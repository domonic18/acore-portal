/**
 * 密码域常量(research R1/R2,方案 Y)
 * 目标格式 = WP6.8:$wp$ + bcrypt(base64(HMAC-SHA384('wp-sha384', password)))
 * 升级判定只看格式前缀,不看 cost
 */
export const PASSWORD_ALGO = {
  PHPASS: "phpass",
  BCRYPT_WP: "bcrypt_wp",
} as const;

export type PasswordAlgoValue = (typeof PASSWORD_ALGO)[keyof typeof PASSWORD_ALGO];

export const BCRYPT_COST = 12;
/** 存量 $wp$ cost 10 一律不重写(零接触承诺);仅此前缀用于分派 */
export const WP_BCRYPT_PREFIX = "$wp$";
export const PHPASS_PREFIX = "$P$";

/** FR-006:长度 ≥8 且含字母与数字且 ≠username */
export const PASSWORD_MIN_LENGTH = 8;

/** 注册占位哈希前缀:激活前不可登录(verify 前缀分派双不命中→false) */
export const PENDING_HASH_PREFIX = "!pending:";
