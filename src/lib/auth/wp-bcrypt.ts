import crypto from "node:crypto";
import bcrypt from "bcrypt";
import { BCRYPT_COST, WP_BCRYPT_PREFIX } from "@/constants/password";

/**
 * 目标密码格式(research R1 方案 Y,WP 6.8 核心同构):
 *   stored = `$wp$` + bcrypt_hash(prehash)
 *   prehash = base64(HMAC-SHA384(key='wp-sha384', msg=password))
 *
 * 与生产 pluggable.php 的行为对齐(2026-10-23 实测定稿,含两处非对称):
 * - 签发(HashPassword 路径):prehash 输入做 trim
 * - 校验(wp_check_password 路径):prehash 输入【无 trim】
 *   ——该非对称系 WP 6.8 核心固有,逐字复刻以保证存量零死角
 * - 透明升级只改站点哈希,明文未变 → 游戏端 SHA1 不受影响(纯站点侧)
 *
 * 2026-11-06 撞库加固(PR-D):换成原生 bcrypt——
 * bcryptjs 的同步实现每次校验独占事件循环约 220ms,撞库 5 次/秒即占满,
 * 全站(商城/论坛/状态页/后台)同时不可用;原生 bcrypt 走 libuv 线程池,
 * 事件循环只承担排队。存储格式与存量用户零影响。
 */

const WP_PREHASH_SECRET = "wp-sha384";

export function wpPreHash(password: string, trim = false): string {
  const input = trim ? password.trim() : password;
  return crypto
    .createHmac("sha384", WP_PREHASH_SECRET)
    .update(input, "utf8")
    .digest("base64");
}

/**
 * 签发(注册设密/改密/重置/登录期升级):"$wp" + "$2y$"(= "$wp$2y$…",与生产存储一致)
 *
 * 原生 bcrypt 产 $2b$;PHP password_hash 存 $2y$(算法等价),归一为生产格式。
 */
export async function hashWpBcrypt(
  password: string,
  cost: number = BCRYPT_COST,
): Promise<string> {
  const body = await bcrypt.hash(wpPreHash(password, true), cost);
  const normalized = /^\$2[ab]\$/.test(body) ? `$2y$${body.slice(4)}` : body;
  // 生产格式 = "$wp" 前缀(3 字符)直接拼接 bcrypt 体(自带 "$2" 头) → "$wp$2y$12$…"
  return `${WP_BCRYPT_PREFIX.slice(0, 3)}${normalized}`;
}

/**
 * 校验(登录路径):stored = "$wp$2y$…" → 切 3 字符得 "$2y$…" bcrypt 体
 * (research R2:与生产 verify 同构 slice(3);接受 $2a$/$2b$/$2y$ 包体)。
 * 存量 $wp$ 哈希零接触——本函数不改写任何数据。
 *
 * minor 位改写:原生 bcrypt 只认 $2a$/$2b$,遇 $2y$(PHP 存储格式)直接判否。
 * 改写 $2y$→$2b$ 是安全的——prehash 是 base64(HMAC-SHA384) 的 64 字符 ASCII,
 * 不含 NUL、不含高位字节,此区间内 $2y$ 与 $2b$ 逐字节等价
 * ($2y$ 相对 $2a$ 的修正只影响高位字符与 NUL 的处理)。
 */
export async function verifyWpBcrypt(password: string, storedHash: string): Promise<boolean> {
  if (!storedHash.startsWith(WP_BCRYPT_PREFIX)) return false;
  const body = storedHash.slice(3);
  if (!/^\$2[aby]\$/.test(body)) return false;
  const comparable = body.startsWith("$2y$") ? `$2b$${body.slice(4)}` : body;
  return bcrypt.compare(wpPreHash(password), comparable);
}
