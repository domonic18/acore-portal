/** 邀请码状态机:data-model §1.2;expired 不落库,消费时刻实时推导 */
export const INVITATION_STATUS = {
  AVAILABLE: "available",
  DISABLED: "disabled",
  FINISH: "finish",
} as const;

export type InvitationStatusValue = (typeof INVITATION_STATUS)[keyof typeof INVITATION_STATUS];

/** 列表/筛选用的推导态(含 expired,实时计算,FR-002) */
export const INVITATION_DERIVED_STATUS = {
  ...INVITATION_STATUS,
  EXPIRED: "expired",
} as const;

export type InvitationDerivedStatus =
  (typeof INVITATION_DERIVED_STATUS)[keyof typeof INVITATION_DERIVED_STATUS];

/** 生成参数边界(contracts/api-admin.md):路由 schema 与生成 service 共用同一份(issue #80) */
export const INVITATION_LIMITS = {
  PREFIX_MIN: 2,
  PREFIX_MAX: 10,
  LENGTH_MIN: 8,
  LENGTH_MAX: 32,
  COUNT_MIN: 1,
  COUNT_MAX: 200,
  MAX_USES_MIN: 1,
  MAX_USES_MAX: 999,
  /** 随机段最小长度:码值 = 前缀 + "-" + 随机段,总长 = 前缀长 + 1 + 随机段长 */
  RANDOM_BODY_MIN: 4,
} as const;

/** 前缀字符集:仅大写字母/数字 */
export const INVITATION_PREFIX_PATTERN = /^[A-Z0-9]+$/;

/** 码值随机串字符集:去混淆(去 0O1lI) */
export const INVITATION_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
