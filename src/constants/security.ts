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
