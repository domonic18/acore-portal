/** 积分域常量(宪法 III:流水为真相源,余额为缓存) */
export const POINT_TX_TYPE = {
  REGISTER_REWARD: "register_reward",
  BADGE_REWARD: "badge_reward",
  SHOP_PAYMENT: "shop_payment",
  MANUAL_ADJUST: "manual_adjust",
  RECURRING: "recurring",
  VISITOR_REFERRAL: "visitor_referral",
} as const;

export type PointTxTypeValue = (typeof POINT_TX_TYPE)[keyof typeof POINT_TX_TYPE];

/** 存量 mycred ref → 新枚举一一映射(FR-103;迁移脚本 import-points 消费) */
export const LEGACY_TX_TYPE_MAP: Record<string, PointTxTypeValue> = {
  registration: POINT_TX_TYPE.REGISTER_REWARD,
  badge_reward: POINT_TX_TYPE.BADGE_REWARD,
  woocommerce_payment: POINT_TX_TYPE.SHOP_PAYMENT,
  manual: POINT_TX_TYPE.MANUAL_ADJUST,
  recurring: POINT_TX_TYPE.RECURRING,
  visitor_referral: POINT_TX_TYPE.VISITOR_REFERRAL,
};

/** 流水类型中文标签(积分页展示,FR-107) */
export const POINT_TX_TYPE_LABEL: Record<PointTxTypeValue, string> = {
  register_reward: "注册奖励",
  badge_reward: "徽章奖励",
  shop_payment: "商店消费",
  manual_adjust: "手动调整",
  recurring: "定期发放",
  visitor_referral: "访问推荐",
};

/** 积分获取类事件 → point_rule.event 取值(research R10:仅获取类经规则表) */
export const POINT_RULE_EVENT = {
  REGISTER: "register",
  BADGE_GRANT: "badge_grant",
} as const;

export type PointRuleEventValue = (typeof POINT_RULE_EVENT)[keyof typeof POINT_RULE_EVENT];

/** 手动调整原因长度约束(FR-105;contracts/api-admin) */
export const ADJUST_REASON_MIN = 2;
export const ADJUST_REASON_MAX = 255;
