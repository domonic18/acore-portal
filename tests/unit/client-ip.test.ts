import { describe, expect, it } from "vitest";
import { normalizeIp, resolveClientIp } from "@/lib/net/client-ip";

/**
 * 客户端 IP 解析(2026-11-06 撞库加固,PR-A):
 * 右起 N 跳信任模型——客户端自带的 XFF 前缀一律丢弃,
 * 取不到(代理链不足/头缺失/值非法)→ null,由调用方走「未知 IP」兜底桶。
 */
describe("resolveClientIp", () => {
  it("右起 1 跳:丢弃客户端伪造的前缀,取链尾", () => {
    expect(resolveClientIp("1.2.3.4, 5.6.7.8", 1)).toBe("5.6.7.8");
    expect(resolveClientIp("1.2.3.4, 5.6.7.8, 9.9.9.9", 1)).toBe("9.9.9.9");
  });

  it("右起 N 跳:N=2 取倒数第二项(上游代理追加自己的对端地址)", () => {
    expect(resolveClientIp("1.2.3.4, 5.6.7.8, 9.9.9.9", 2)).toBe("5.6.7.8");
    expect(resolveClientIp("1.2.3.4, 5.6.7.8", 2)).toBe("1.2.3.4");
  });

  it("单段链(Caddy 替换而非追加)也能取到", () => {
    expect(resolveClientIp("1.2.3.4", 1)).toBe("1.2.3.4");
  });

  it("hops=0(无可信代理)→ null,绝不信 XFF", () => {
    expect(resolveClientIp("1.2.3.4", 0)).toBeNull();
    expect(resolveClientIp("1.2.3.4", 0, "5.6.7.8")).toBeNull();
  });

  it("头缺失 → null(调用方走未知桶,不得跳过限流)", () => {
    expect(resolveClientIp(null, 1)).toBeNull();
    expect(resolveClientIp(undefined, 1)).toBeNull();
    expect(resolveClientIp("", 1)).toBeNull();
  });

  it("代理链不足 → null(hops=2 但链长 1)", () => {
    expect(resolveClientIp("1.2.3.4", 2)).toBeNull();
    expect(resolveClientIp("1.2.3.4", 2, "5.6.7.8")).toBeNull();
  });

  it("备用来源只在 hops=1 时采信(X-Real-IP 由唯一可信代理写入)", () => {
    expect(resolveClientIp(null, 1, "5.6.7.8")).toBe("5.6.7.8");
    expect(resolveClientIp(null, 1, "垃圾")).toBeNull();
  });

  it("IPv4 / IPv6 均可解析,IPv6 统一小写", () => {
    expect(resolveClientIp("203.0.113.7", 1)).toBe("203.0.113.7");
    expect(resolveClientIp("2001:DB8::1", 1)).toBe("2001:db8::1");
    expect(resolveClientIp("::ffff:192.0.2.1", 1)).toBe("::ffff:192.0.2.1");
  });

  it("非法值一律拒绝(垃圾串/前导零 IPv4/带 zone id)", () => {
    expect(resolveClientIp("not-an-ip", 1)).toBeNull();
    expect(resolveClientIp("999.1.1.1", 1)).toBeNull();
    expect(resolveClientIp("01.2.3.4", 1)).toBeNull();
    expect(resolveClientIp("fe80::1%eth0", 1)).toBeNull();
  });

  it("超长值拒绝(audit_log.ip 是 VarChar(45))", () => {
    const long = `${"1".repeat(46)}`;
    expect(resolveClientIp(long, 1)).toBeNull();
    expect(normalizeIp(long)).toBeNull();
  });

  it("IPv6 结构校验:组数不足/过多/多次压缩均非法", () => {
    expect(resolveClientIp("1:2:3:4:5:6:7", 1)).toBeNull();
    expect(resolveClientIp("1:2:3:4:5:6:7:8:9", 1)).toBeNull();
    expect(resolveClientIp("1::2::3", 1)).toBeNull();
    expect(resolveClientIp("1:2:3:4:5:6:7:8", 1)).toBe("1:2:3:4:5:6:7:8");
  });
});
