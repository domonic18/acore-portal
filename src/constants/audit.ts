/** 审计域常量(宪法 VI:记事件不记敏感值);M2 增 shop/admin/points 域分组(T005 枚举对齐) */
export const AUDIT_CATEGORY = {
  SOAP: "soap",
  MAIL: "mail",
  SECURITY: "security",
  SHOP: "shop",
  ADMIN: "admin",
  POINTS: "points",
} as const;

export type AuditCategoryValue = (typeof AUDIT_CATEGORY)[keyof typeof AUDIT_CATEGORY];

/** M1 必审事件(data-model §1.9) */
export const AUDIT_ACTION = {
  LOGIN_FAILED: "login_failed",
  HASH_UPGRADED: "hash_upgraded",
  PASSWORD_CHANGED: "password_changed",
  PASSWORD_RESET: "password_reset",
  ACCOUNT_ACTIVATED: "account_activated",
  TOKEN_CONSUMED: "token_consumed",
  OWNERSHIP_VIOLATION: "ownership_violation",
  ADMIN_ACCESS_VIOLATION: "admin_access_violation",
  MAIL_SEND_FAILED: "mail_send_failed",
  PASSWORD_DUAL_WRITE_FAILED: "password_dual_write_failed",
  PASSWORD_DUAL_WRITE_RECOVERED: "password_dual_write_recovered",
  ACCOUNT_DUAL_WRITE_FAILED: "account_dual_write_failed",
  SOAP_ATTEMPT: "soap_attempt",
  INVITATION_GENERATED: "invitation_codes_generated",
  INVITATION_DISABLED: "invitation_code_disabled",
  EMAIL_CHANGE_CONFIRMED: "email_change_confirmed",
  /** M2 积分手调(US5 后台;payload 含调整前后余额) */
  POINTS_ADJUST: "points_adjust",
  /** M2 发货:SKU 未注册处理器防御性拒绝(soap-delivery 契约 §2) */
  DELIVERY_NO_HANDLER: "delivery_no_handler",
  /** M2 后台敏感操作(US5,api-admin 契约:补发/退款/徽章授予/复核落定) */
  ORDER_REDELIVER: "order_redeliver",
  ORDER_REFUND: "order_refund",
  BADGE_GRANT: "badge_grant",
  REVIEW_RESOLVED: "review_resolved",
} as const;

export type AuditActionValue = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
