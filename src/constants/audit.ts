/** 审计域常量(宪法 VI:记事件不记敏感值) */
export const AUDIT_CATEGORY = {
  SOAP: "soap",
  MAIL: "mail",
  SECURITY: "security",
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
} as const;

export type AuditActionValue = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
