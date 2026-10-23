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

/** 生成参数边界(contracts/api-admin.md) */
export const INVITATION_LIMITS = {
  PREFIX_MAX: 16,
  LENGTH_MIN: 8,
  LENGTH_MAX: 32,
  COUNT_MIN: 1,
  COUNT_MAX: 200,
  MAX_USES_MIN: 1,
  MAX_USES_MAX: 999,
} as const;

/** 码值随机串字符集:去混淆(去 0O1lI) */
export const INVITATION_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
