import crypto from "node:crypto";

/**
 * phpass portable hash(WP `$P$` 变体)自实现过渡垫片(research R2 方案 Y):
 * - 仅服务存量 3,672 条 `$P$B` 哈希的登录校验与种子生成
 * - 存量衰减完成后可整体移除(唯一被允许消失的依赖)
 * - 算法逐字对照 WP class-phpass.php(开源端口,迭代 MD5 + itoa64)
 * - 与 WP 生产行为一致:校验时对 password 无 trim
 */

const ITOA64 =
  "./0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

export const PHPASS_DEFAULT_COUNT_LOG2 = 13; // 'B' → 2^13 = 8,192 次迭代(存量实测均为 $P$B)

function md5Binary(input: string): Buffer {
  return crypto.createHash("md5").update(input, "utf8").digest();
}

/** 迭代链专用:二进制 hash + 文本 password 必须 Buffer.concat,禁止隐式 toString(有损) */
function md5Chain(hash: Buffer, password: string): Buffer {
  return crypto
    .createHash("md5")
    .update(Buffer.concat([hash, Buffer.from(password, "utf8")]))
    .digest();
}

/** phpass encode64:6bit 拆包,逐字对照 class-phpass.php(注意 i++ 语义) */
function encode64(input: Buffer, count: number): string {
  let output = "";
  let i = 0;
  do {
    let value = input[i]!;
    i += 1;
    output += ITOA64[value & 0x3f];
    if (i < count) value |= input[i]! << 8;
    output += ITOA64[(value >> 6) & 0x3f];
    const checkA = i;
    i += 1;
    if (checkA >= count) break;
    if (i < count) value |= input[i]! << 16;
    output += ITOA64[(value >> 12) & 0x3f];
    const checkB = i;
    i += 1;
    if (checkB >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  } while (i < count);
  return output;
}

function randomSalt(length: number): string {
  const bytes = crypto.randomBytes(length);
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += ITOA64[bytes[i]! & 0x3f];
  }
  return salt;
}

/** crypt_private:setting = $P$<count_log2><8 位盐> */
export function phpassCryptPrivate(password: string, setting: string): string {
  if (!setting.startsWith("$P$")) return "*0";
  const countLog2 = ITOA64.indexOf(setting[3]!);
  if (countLog2 < 7 || countLog2 > 30) return "*0";
  const salt = setting.slice(4, 12);
  if (salt.length !== 8) return "*0";

  const iterations = 1 << countLog2;
  let hash = md5Binary(salt + password);
  for (let i = 0; i < iterations; i++) {
    hash = md5Chain(hash, password);
  }
  return setting.slice(0, 12) + encode64(hash, 16);
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** 校验存量 $P$ 哈希(WP CheckPassword 同构:无 trim,常量时间比较) */
export function verifyPhpass(password: string, storedHash: string): boolean {
  if (!storedHash.startsWith("$P$")) return false;
  const computed = phpassCryptPrivate(password, storedHash);
  return computed !== "*0" && safeEqual(computed, storedHash);
}

/** 签发 phpass 哈希(仅种子/测试用;新签发一律 wp-bcrypt,research R1) */
export function hashPhpass(
  password: string,
  countLog2: number = PHPASS_DEFAULT_COUNT_LOG2,
): string {
  const setting =
    "$P$" + ITOA64[countLog2] + randomSalt(8);
  return phpassCryptPrivate(password, setting);
}
