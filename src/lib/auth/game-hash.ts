import crypto from "node:crypto";

/**
 * 游戏端"同密"哈希(research R3,铁律②游戏侧):
 * sha_pass_hash = SHA1(UPPER(username) + ':' + UPPER(password))
 * 与站点端 $wp$ bcrypt 属两套哈希体系(同明文、各端各哈希),不可互换。
 */
export function gameShaPassHash(username: string, password: string): string {
  return crypto
    .createHash("sha1")
    .update(`${username}:${password}`.toUpperCase(), "utf8")
    .digest("hex")
    .toUpperCase();
}

/** 通用 SHA-256 hex(令牌指纹/session refresh 指纹共用,research R11) */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
