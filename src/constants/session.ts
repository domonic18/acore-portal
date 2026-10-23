/** 会话域常量(research R4) */
export const SESSION = {
  ACCESS_COOKIE: "ap_access",
  REFRESH_COOKIE: "ap_refresh",
  ACCESS_TTL_SECONDS: 2 * 60 * 60, // 2h
  REFRESH_TTL_SECONDS: 30 * 24 * 60 * 60, // remember 30d
  REDIS_PREFIX: "session", // session:{userId}:{jti}
  REFRESH_REDIS_PREFIX: "refresh", // refresh:{userId}:{tokenId}
} as const;

/** 用户名规则 FR-003:2-32 位,禁 @ */
export const USERNAME_REGEX = /^[A-Za-z0-9_一-龥]{2,32}$/;
