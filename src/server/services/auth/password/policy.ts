import "server-only";
import { verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { verifyPhpass } from "@/lib/auth/phpass";
import { PASSWORD_DENY_LIST } from "@/constants/password-deny-list";
import { PASSWORD_MIN_LENGTH, PHPASS_PREFIX, WP_BCRYPT_PREFIX } from "@/constants/password";

/**
 * 口令策略(撞库加固 PR-F):
 * 单一口令入口——注册激活 / 登录态改密 / 找回密码重置三条链路都走这里,
 * 规则只在这里写一遍,新增链路不会漏。
 *
 * 规则:
 * 1. 长度与字符集(沿用 FR-006:≥8 位且同时含字母与数字)
 * 2. 用户名相似:不得等于或包含用户名
 * 3. 弱口令:命中本地拒绝表 / 纯数字 → 拒绝
 * 4. 不得复用当前密码(改密/重置路径传入旧哈希)
 *
 * 弱口令表的口径与理由见 `constants/password-deny-list.ts`。
 */

/** 常见符号还原:撞库字典大量用 @ / ! / $ 顶替字母 */
const LEET_SYMBOLS: Record<string, string> = {
  "@": "a",
  "$": "s",
  "!": "i",
  "|": "i",
  "+": "t",
  "%": "a",
};

/**
 * 归一:小写 + 符号还原 + 去数字。
 * 拒绝表与待测口令必须走同一函数——口径不一致就会出现「表里写了却拦不住」。
 * 去数字让 `abc123456` 命中表中的 `abc123`,也让 `iloveyou1` 命中 `iloveyou`。
 */
export function normalizeForDeny(password: string): string {
  return password
    .toLowerCase()
    .replace(/[@$!|+%]/g, (c) => LEET_SYMBOLS[c] ?? c)
    .replace(/\d/g, "");
}

const DENY_SET = new Set<string>(
  PASSWORD_DENY_LIST.map((entry) => normalizeForDeny(entry)).filter((entry) => entry.length > 0),
);

/** 用户名短于此长度时不做「包含」判定:2 位用户名的包含面太大,会误伤正常口令 */
const MIN_USERNAME_SIMILARITY_LEN = 3;

/** 弱口令判定:命中拒绝表,或整串是数字 */
export function isDenyListedPassword(password: string): boolean {
  if (/^\d+$/.test(password)) return true;
  return DENY_SET.has(normalizeForDeny(password));
}

/**
 * 用户名相似判定:
 * - 完全相同
 * - 包含用户名(含「用户名 + 数字/符号后缀」这一最常见变体——它是「包含」的子集)
 * 用户名过短时跳过「包含」判定(见 MIN_USERNAME_SIMILARITY_LEN)。
 */
export function isUsernameDerivedPassword(password: string, username: string): boolean {
  const p = password.toLowerCase();
  const u = username.toLowerCase();
  if (p === u) return true;
  if (u.length < MIN_USERNAME_SIMILARITY_LEN) return false;
  return p.includes(u);
}

/** 站点侧哈希前缀分派(与 login 同一权威,research R2) */
export async function verifySitePassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  if (storedHash.startsWith(WP_BCRYPT_PREFIX)) {
    return verifyWpBcrypt(password, storedHash);
  }
  if (storedHash.startsWith(PHPASS_PREFIX)) {
    return verifyPhpass(password, storedHash);
  }
  return false;
}

/**
 * 口令策略校验(单一入口)。
 * `previousHash` 传入时额外拒绝「与当前密码相同」——改密与重置都拿得到旧哈希。
 */
export async function validateNewPassword(
  password: string,
  username: string,
  opts: { previousHash?: string | null } = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return { ok: false, message: `密码至少 ${PASSWORD_MIN_LENGTH} 位。` };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, message: "密码需同时包含字母和数字。" };
  }
  if (isUsernameDerivedPassword(password, username)) {
    return { ok: false, message: "密码不能与用户名相同,也不能包含用户名。" };
  }
  if (isDenyListedPassword(password)) {
    return { ok: false, message: "密码过于常见,请更换一个更独特的密码。" };
  }
  if (opts.previousHash && (await verifySitePassword(opts.previousHash, password))) {
    return { ok: false, message: "新密码不能与当前密码相同。" };
  }
  return { ok: true };
}
