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
