import { describe, expect, it } from "vitest";
import {
  hashPhpass,
  phpassCryptPrivate,
  verifyPhpass,
} from "@/lib/auth/phpass";

/**
 * 黄金向量(来源:passlib 1.7.4 独立实现生成,2026-10-23 本地交叉核对)。
 * passlib 与本实现无共享代码,向量 MATCH 即双实现一致(research R2)。
 * 生产凭据/哈希不入 git——正式 golden case 见 specs/001 research R2。
 */
const PASSLIB_VECTORS: Array<[string, string]> = [
  ["test12345", "$P$BaQhNYI93YVHpM4ThRTw0MQnYK9VGd."],
  ["oldpass123", "$P$Bh7pNG4lSANlVMYqRnKUxYT3lJ0axQ1"],
  [" legacyuser 2026! ", "$P$BZ6Pz4vJgc39MpU57tH5v.7Acp25WT1"], // 含首尾空格:校验无 trim
  ["x".repeat(100), "$P$B0HZ4dIi.8aQVMX6P892o7fpn61w5//"], // 超长密码不截断(MD5 无 72 字节限制)
];

describe("phpass 过渡垫片(research R2)", () => {
  it.each(PASSLIB_VECTORS)("passlib 向量校验通过:%s", (password, hash) => {
    expect(verifyPhpass(password, hash)).toBe(true);
  });

  it.each(PASSLIB_VECTORS)("错误密码拒绝:%s", (password, hash) => {
    expect(verifyPhpass(`${password}x`, hash)).toBe(false);
  });

  it("向量格式锁定:count_log2=B(13),总长 34", () => {
    const [, hash] = PASSLIB_VECTORS[0]!;
    expect(hash).toMatch(/^\$P\$B[./0-9A-Za-z]{30}$/);
    expect(hash).toHaveLength(34);
  });

  it("rounds=7 向量(迭代数下界边界)", () => {
    expect(verifyPhpass("short", "$P$5wglV9xnpAnzZG8W0xB5nXkAOtee781")).toBe(true);
  });

  it("自哈希自校验(cost 13=存量格式)且盐随机", () => {
    const a = hashPhpass("legacyuser-migration-test");
    const b = hashPhpass("legacyuser-migration-test");
    expect(a).not.toBe(b); // 盐不同
    expect(a).toMatch(/^\$P\$B/);
    expect(verifyPhpass("legacyuser-migration-test", a)).toBe(true);
  });

  it("非 $P$ 前缀拒绝", () => {
    expect(verifyPhpass("test12345", "$wp$2y$10$whatever")).toBe(false);
    expect(verifyPhpass("test12345", "")).toBe(false);
  });

  it("非法 count_log2 字符拒绝(crypt_private 返回 *0 语义)", () => {
    // setting[3] = '?' 不在 itoa64 → indexOf=-1 → 拒绝
    expect(phpassCryptPrivate("x", "$P$?12345678")).toBe("*0");
  });
});
