/**
 * 客户端 IP 解析(2026-11-06 撞库加固,PR-A):
 * 纯函数、零 import —— 可在 node / edge / 单测里跑,不拖任何运行时依赖。
 *
 * 信任模型:**右起 N 跳**(trustedHops)
 * 应用正前方有 N 个可信代理;每个代理把自己观察到的对端地址**追加**到 XFF 尾部,
 * 于是链尾第 N 项才是真实客户端地址,客户端自带的任何前缀一律丢弃。
 * (Caddy 追加或替换都成立:追加时链尾是真实地址,替换时链只有一项。)
 *
 * 取不到(代理链不足 / 头缺失 / 值非法)→ 返回 null。
 * 调用方**必须**走「未知 IP」兜底桶,不得因此跳过限流。
 */

/** 无法判定客户端 IP 时的兜底标识(计入独立限流桶) */
export const UNKNOWN_CLIENT_IP = "unknown";

/** IP 文本最大长度(audit_log.ip 是 VarChar(45)) */
export const MAX_IP_LENGTH = 45;

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const HEX_GROUP_RE = /^[0-9a-fA-F]{1,4}$/;

/** IPv4:四段十进制,每段 ≤255,且不接受前导零(避免同一地址多种写法绕过计数) */
function isIpv4(value: string): boolean {
  const m = IPV4_RE.exec(value);
  if (!m) return false;
  return m.slice(1).every((octet) => {
    if (octet.length > 1 && octet.startsWith("0")) return false;
    return Number(octet) <= 255;
  });
}

/** IPv6 片段的组数(嵌入式 IPv4 占 2 组);非法返回 null */
function countIpv6Groups(part: string): number | null {
  if (part === "") return 0;
  let count = 0;
  for (const item of part.split(":")) {
    if (item.includes(".")) {
      if (!isIpv4(item)) return null;
      count += 2;
    } else {
      if (!HEX_GROUP_RE.test(item)) return null;
      count += 1;
    }
  }
  return count;
}

/** IPv6:最多一处 "::" 压缩;压缩时两侧组合 ≤7 组(至少省下一组) */
function isIpv6(value: string): boolean {
  if (value.length > MAX_IP_LENGTH) return false;
  const idx = value.indexOf("::");
  if (idx !== value.lastIndexOf("::")) return false;
  if (idx === -1) return countIpv6Groups(value) === 8;
  const head = countIpv6Groups(value.slice(0, idx));
  const tail = countIpv6Groups(value.slice(idx + 2));
  if (head === null || tail === null) return false;
  return head + tail <= 7;
}

/** IP 文本合法性 + 归一(IPv6 统一小写,便于同一地址聚到同一个计数桶) */
export function normalizeIp(value: string): string | null {
  const v = value.trim();
  if (!v || v.length > MAX_IP_LENGTH) return null;
  if (v.includes("%")) return null; // zone id 不入库
  if (isIpv4(v)) return v;
  if (isIpv6(v)) return v.toLowerCase();
  return null;
}

/**
 * 从 XFF 链解析真实客户端 IP。
 *
 * @param xff        `X-Forwarded-For` 原始头(逗号分隔,可能含客户端伪造的前缀)
 * @param trustedHops 应用正前方的可信代理跳数;≤0 表示无可信代理 → 一律 null
 * @param fallback   备用来源(如 `X-Real-IP`);**仅在 trustedHops === 1 且 XFF 缺失时**
 *                   采信——此时该头由唯一可信代理写入;hops ≥ 2 时它只是中间代理地址,
 *                   拿来当客户端 IP 会把整个上游的用户并成一个桶(误伤),故不用。
 * @returns 归一后的客户端 IP,不可判定时 null
 */
export function resolveClientIp(
  xff: string | null | undefined,
  trustedHops: number,
  fallback?: string | null,
): string | null {
  if (!Number.isInteger(trustedHops) || trustedHops < 1) return null;

  const parts = (xff ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (parts.length < trustedHops) {
    if (trustedHops === 1 && fallback) {
      const fb = normalizeIp(fallback);
      if (fb) return fb;
    }
    return null;
  }

  // 右起第 trustedHops 项 = 真实客户端地址
  const candidate = parts[parts.length - trustedHops];
  return candidate ? normalizeIp(candidate) : null;
}
