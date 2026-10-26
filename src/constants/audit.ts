/** 审计域常量(宪法 VI:记事件不记敏感值);M2 增 shop/admin/points,M3 增 content/forum(T004 枚举对齐) */
export const AUDIT_CATEGORY = {
  SOAP: "soap",
  MAIL: "mail",
  SECURITY: "security",
  SHOP: "shop",
  ADMIN: "admin",
  POINTS: "points",
  CONTENT: "content",
  FORUM: "forum",
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
  /** M3 内容域后台操作(category=content;只记 id/slug 不记正文,T048 脱敏口径) */
  CONTENT_ARTICLE_SAVED: "content_article_saved",
  CONTENT_ARTICLE_DELETED: "content_article_deleted",
  CONTENT_PAGE_SAVED: "content_page_saved",
  CONTENT_PAGE_DELETED: "content_page_deleted",
  CONTENT_TAXONOMY_SAVED: "content_taxonomy_saved",
  CONTENT_TAXONOMY_DELETED: "content_taxonomy_deleted",
  CONTENT_MEDIA_DELETED: "content_media_deleted",
  CONTENT_PROGRESSION_SAVED: "content_progression_saved",
  CONTENT_PROGRESSION_DELETED: "content_progression_deleted",
  /** M3 状态人工配置变更(category=admin;payload 含前后值,FR-221) */
  STATUS_CONFIG_CHANGE: "status_config_change",
  /** M3 论坛版主操作与越权(category=forum,Q3 字段化流转,SC-207) */
  FORUM_THREAD_PIN: "forum_thread_pin",
  FORUM_THREAD_CLOSE: "forum_thread_close",
  FORUM_THREAD_LABEL: "forum_thread_label",
  FORUM_THREAD_DELETE: "forum_thread_delete",
  FORUM_THREAD_UNDELETE: "forum_thread_undelete",
  /** M4 后台版块管理(category=forum;payload 含 id/slug,改名记 old/new) */
  FORUM_BOARD_SAVED: "forum_board_saved",
  FORUM_BOARD_DELETED: "forum_board_deleted",
  FORUM_MODERATION_VIOLATION: "forum_moderation_violation",
  /** M4 防滥用:连续失败达阈值触发锁定(category=security;payload 无密码,只记用户名/ip/计数) */
  LOGIN_LOCKED: "login_locked",
  /** M4 系统设置保存(category=admin;只落组名/键名/掩码 diff,任何值不落审计) */
  SETTINGS_CHANGED: "settings_changed",
  /** M4 设置页测试发信(category=admin;记 to) */
  SETTINGS_TEST_MAIL: "settings_test_mail",
  /** M4 后台角色变更(category=admin;payload 含前后角色;成功即吊销目标全部会话) */
  USER_ROLE_CHANGE: "user_role_change",
  /** 商品删除(category=shop;仅限零订单商品,payload 含 sku/name;有订单走下架) */
  PRODUCT_DELETED: "product_deleted",
  /** 首页轮播物料管理(category=content;payload 含 id/title/enabled) */
  HOME_BANNER_SAVED: "home_banner_saved",
  HOME_BANNER_DELETED: "home_banner_deleted",
} as const;

export type AuditActionValue = (typeof AUDIT_ACTION)[keyof typeof AUDIT_ACTION];
