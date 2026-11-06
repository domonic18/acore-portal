/**
 * 安全域 Redis 键构造器(2026-11-06 撞库加固):
 * 键格式集中一处,调用方不感知,测试可按此格式注入状态。
 * 前缀约定:rl:* = 固定窗口计数,login:lock:* = 显式锁。
 * 本模块被 constants 层全栈引用(含客户端组件),只放纯字符串拼接,
 * 任何需要加密/散列的键构造器放服务端(如 services/auth/login-guard)。
 */

/** 用户名维失败计数(固定窗口) */
export const loginFailKey = (username: string) => `rl:login:fail:u:${username.toLowerCase()}`;

/** 客户端 IP 维失败计数(固定窗口) */
export const loginFailIpKey = (ip: string) => `rl:login:fail:ip:${ip}`;

/** 用户名维显式锁(达阈值后写入,TTL=loginLockSec) */
export const loginLockKey = (username: string) => `login:lock:u:${username.toLowerCase()}`;

/**
 * IP 维显式锁(达 IP 硬阈后写入,TTL=loginIpLockSec)。
 * 2026-11-06 撞库加固:IP 维越阈只锁攻击源 IP,**绝不牵连受害账号**——
 * 旧实现把 IP 计数与账号锁混在一起,攻击者一次请求就能锁一个受害账号。
 */
export const loginIpLockKey = (ip: string) => `login:lock:ip:${ip}`;

/** IP 软锁(越软阈后短暂串行化,TTL=loginSoftLockSec)——只降速不拒绝 */
export const loginSoftLockKey = (ip: string) => `login:softlock:ip:${ip}`;

/** 全局哈希预算窗口(秒)——键名与计数 TTL 必须同源,不得各写一份 60 */
export const LOGIN_GLOBAL_WINDOW_SEC = 60;

/** 「未知 IP」兜底桶窗口(秒):IP 不可判定时的失败计数窗口(短窗自愈更快) */
export const LOGIN_UNKNOWN_IP_WINDOW_SEC = 60;

/** 全局哈希预算计数(固定窗口):限制全站真实哈希次数,兜住 CPU 背压 */
export const loginGlobalKey = () => `rl:login:global:${LOGIN_GLOBAL_WINDOW_SEC}s`;

/** 小时级固定窗口(秒):注册/找回/换邮箱按 IP 限速共用 */
export const IP_HOURLY_WINDOW_SEC = 3600;

/** 注册按 IP 限速(固定窗口)——未鉴权端点,防 DB 放大 */
export const registerIpKey = (ip: string) => `rl:register:ip:${ip}`;

/** 找回密码按 IP 限速:申请与提交重置**共用一个桶**(同一流程的两段) */
export const pwresetIpKey = (ip: string) => `rl:pwreset:ip:${ip}`;

/** 邮箱变更确认按 IP 限速(token 即凭证,不要求登录态) */
export const emailChangeIpKey = (ip: string) => `rl:emailchange:ip:${ip}`;

/** 分钟级固定窗口(秒):状态页限速共用(前台状态卡 30s 轮询,窗口须短于轮询周期的数倍) */
export const STATUS_WINDOW_SEC = 60;

/** 状态页按 IP 限速(固定窗口)——公开无鉴权端点,防 SOAP/DB 放大 */
export const statusIpKey = (ip: string) => `rl:status:ip:${ip}`;

/** 状态页全局限速(固定窗口):护住 worldserver 与 characters 库,不限单 IP 也能护住 */
export const statusGlobalKey = () => `rl:status:global:${STATUS_WINDOW_SEC}s`;

/** 分钟级固定窗口(秒):阅读计数按 IP 总闸共用 */
export const ARTVIEW_IP_WINDOW_SEC = 60;

/** 阅读计数按 IP 总闸(固定窗口):防单个 IP 对大量文章刷写(DB 放大) */
export const artviewIpKey = (ip: string) => `rl:artview:ip:${ip}`;

/**
 * 阅读计数按 (IP, 文章) 窗口闸:同一 IP 对同一篇在窗口内只计一次,
 * 防刷阅读量(同一篇文章反复刷新把计数刷高)。
 */
export const artviewArticleKey = (ip: string, slug: string) =>
  `rl:artview:article:${ip}:${slug}`;
