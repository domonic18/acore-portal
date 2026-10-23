import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { hashWpBcrypt, verifyWpBcrypt, wpPreHash } from "@/lib/auth/wp-bcrypt";

/**
 * 目标格式测试(research R1/R2,方案 Y)。
 * 算法正确性的最终 golden case = 生产真实凭据端到端 MATCH
 * (2026-10-23 账号 422169327,凭据存 workspace/verify-credentials.txt,不入 git)。
 * 本文件只锁定格式与行为契约。
 */
describe("wp-bcrypt 目标格式(research R1 方案 Y)", () => {
  it("签发格式:$wp$ + $2y$ + cost 12", () => {
    const hash = hashWpBcrypt("S0me-Password1");
    expect(hash).toMatch(/^\$wp\$2y\$12\$/);
    expect(verifyWpBcrypt("S0me-Password1", hash)).toBe(true);
    expect(verifyWpBcrypt("S0me-Password2", hash)).toBe(false);
  });

  it("校验接受 $2a$/$2b$ 包体(兼容存量/历史签发)", () => {
    const stored = hashWpBcrypt("S0me-Password1");
    // stored = "$wp" + "$2y$12$…";替换版本号后仍应通过
    const body = stored.slice(3); // "$2y$12$…"
    for (const ver of ["2a", "2b", "2y"]) {
      const variant = `$wp$${ver}${body.slice(3)}`;
      expect(verifyWpBcrypt("S0me-Password1", variant)).toBe(true);
    }
  });

  it("非 $wp$ 前缀拒绝(分派职责在调用方,本层双保险)", () => {
    expect(verifyWpBcrypt("x", "$P$B12345678abcdefghijklmnopqrstuv")).toBe(false);
    expect(verifyWpBcrypt("x", "")).toBe(false);
  });

  it("校验路径无 trim(research R2 与生产 verify 一致)", () => {
    const hash = hashWpBcrypt("padded "); // 签发侧 trim → 等价于 "padded"
    expect(verifyWpBcrypt("padded", hash)).toBe(true);
    expect(verifyWpBcrypt(" padded", hash)).toBe(false); // 校验侧不 trim
  });

  it("HMAC-SHA384 预哈希 defeat bcrypt 72 字节截断", () => {
    // prehash 输出恒为 64 字符 base64(<72),超长密码尾部差异保留
    const base = "a".repeat(72);
    const h1 = hashWpBcrypt(`${base}TAIL1`);
    const h2 = hashWpBcrypt(`${base}TAIL2`);
    expect(h1).not.toBe(h2);
    expect(verifyWpBcrypt(`${base}TAIL1`, h2)).toBe(false);
  });

  it("prehash 为 base64(HMAC-SHA384('wp-sha384', pwd)) 可复算", () => {
    const expected = crypto
      .createHmac("sha384", "wp-sha384")
      .update("test-input")
      .digest("base64");
    expect(wpPreHash("test-input")).toBe(expected);
  });
});
