/** 积分域常量(宪法 III:流水为真相源,余额为缓存) */
export const POINT_TX_TYPE = {
  REGISTER_REWARD: "register_reward",
} as const;

export type PointTxTypeValue = (typeof POINT_TX_TYPE)[keyof typeof POINT_TX_TYPE];

/** M1 注册奖励(spec FR-008 裁决:选 A,+2 随 M1 落地) */
export const REGISTER_REWARD_AMOUNT = 2;
