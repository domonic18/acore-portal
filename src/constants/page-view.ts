/** 页面访问埋点常量(自建流量统计;2026-11-06 起替代 umami 自托管) */

/** 路径入库截断长度(与表字段 varchar(256) 对齐) */
export const PAGE_VIEW_PATH_MAX = 256;

/** 原始事件保留天数(超期由惰性清理删除;统计用途不需要长期留存) */
export const PAGE_VIEW_RETENTION_DAYS = 90;

/** 不计入前台流量的路径前缀(后台与旧 WP 后台) */
export const PAGE_VIEW_EXCLUDED_PREFIXES = ["/admin", "/wp-admin"] as const;

/** 看板区块统计窗口(小时) */
export const PAGE_VIEW_DASHBOARD_WINDOW_HOURS = 24;
