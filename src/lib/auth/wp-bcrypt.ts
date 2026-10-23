import crypto from "node:crypto";
import bcryptPkg from "bcryptjs";
import { BCRYPT_COST, WP_BCRYPT_PREFIX } from "@/constants/password";

const { genSaltSync, hashSync, compareSync } = bcryptPkg;

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
 */

const WP_PREHASH_SECRET = "wp-sha384";

export function wpPreHash(password: string, trim = false): string {
  const input = trim ? password.trim() : password;
  return crypto
    .createHmac("sha384", WP_PREHASH_SECRET)
    .update(input, "utf8")
    .digest("base64");
}

/** 签发(注册设密/改密/重置/登录期升级):"$wp" + "$2y$"(= "$wp$2y$…",与生产存储一致) */
export function hashWpBcrypt(password: string, cost: number = BCRYPT_COST): string {
  let body = hashSync(wpPreHash(password, true), genSaltSync(cost));
  // bcryptjs 产 $2a$/$2b$;PHP password_hash 存 $2y$(算法等价),归一为生产格式
  if (/^\$2[ab]\$/.test(body)) body = `$2y$${body.slice(4)}`;
  // 生产格式 = "$wp" 前缀(3 字符)直接拼接 bcrypt 体(自带 "$2" 头) → "$wp$2y$12$…"
  return `${WP_BCRYPT_PREFIX.slice(0, 3)}${body}`;
}

/**
 * 校验(登录路径):stored = "$wp$2y$…" → 切 3 字符得 "$2y$…" bcrypt 体
 * (research R2:与生产 verify 同构 slice(3);接受 $2a$/$2b$/$2y$ 包体)。
 * 存量 $wp$ 哈希零接触——本函数不改写任何数据。
 */
export function verifyWpBcrypt(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith(WP_BCRYPT_PREFIX)) return false;
  const body = storedHash.slice(3);
  if (!/^\$2[aby]\$/.test(body)) return false;
  return compareSync(wpPreHash(password), body);
}
