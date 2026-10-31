import crypto from "node:crypto";

/**
 * 游戏端 SRP6 同密实现(对齐 AzerothCore src/common/Cryptography/Authentication/SRP6.cpp):
 *   v = g^x mod N,  x = SHA1(salt || SHA1(UPPER(user):UPPER(pass))),  g = 7,
 *   N = 0x894B645E…9BB7(字符串自然十六进制即整数值)。
 * 字节序陷阱:AC BigNumber 数组入口默认 littleEndian=true——x 指数按小端反读成整数,
 * verifier 结果也按小端落库(binary(32) 原样即小端字节)。已用真机库 salt/verifier 向量双向验证。
 * 与站点端 $wp$ bcrypt 属两套哈希体系(同明文、各端各哈希),不可互换。
 */
const N = BigInt("0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7");
const G = 7n;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    base = (base * base) % mod;
    exp >>= 1n;
  }
  return result;
}

/** 大小写归一仅限拉丁字母(对应 AC Utf8ToUpperOnlyLatin),非 ASCII 字节原样保留 */
function upperLatin(s: string): string {
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

/** 计算 SRP6 verifier(salt 32B 原始字节 → verifier 32B 小端字节;接受 Uint8Array/Buffer) */
export function srp6Verifier(username: string, password: string, salt: Uint8Array): Buffer {
  const h1 = crypto
    .createHash("sha1")
    .update(`${upperLatin(username)}:${upperLatin(password)}`, "utf8")
    .digest();
  const xBytes = crypto
    .createHash("sha1")
    .update(Buffer.concat([Buffer.from(salt), h1]))
    .digest();
  const x = BigInt(`0x${Buffer.from(xBytes).reverse().toString("hex")}`);
  const v = modPow(G, x, N).toString(16).padStart(64, "0");
  return Buffer.from(v, "hex").reverse();
}

/** 注册/改密凭证(对应 AC MakeRegistrationData:随机 salt + verifier,hex 字符串) */
export function srp6MakeRegistrationData(
  username: string,
  password: string,
): { salt: string; verifier: string } {
  const salt = crypto.randomBytes(32);
  return { salt: salt.toString("hex"), verifier: srp6Verifier(username, password, salt).toString("hex") };
}

/** 通用 SHA-256 hex(令牌指纹/session refresh 指纹共用,research R11) */
export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}
