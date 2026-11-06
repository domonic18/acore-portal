import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import bcrypt from "bcrypt";
import { hashWpBcrypt, verifyWpBcrypt, wpPreHash } from "@/lib/auth/wp-bcrypt";

/**
 * 目标格式测试(research R1/R2,方案 Y)。
 * 算法正确性的最终 golden case = 生产真实凭据端到端 MATCH
 * (2026-10-23 账号 422169327,凭据存 workspace/verify-credentials.txt,不入 git)。
 * 本文件只锁定格式与行为契约。
 */
describe("wp-bcrypt 目标格式(research R1 方案 Y)", () => {
  it("签发格式:$wp$ + $2y$ + cost 12", async () => {
    const hash = await hashWpBcrypt("S0me-Password1");
    expect(hash).toMatch(/^\$wp\$2y\$12\$/);
    expect(await verifyWpBcrypt("S0me-Password1", hash)).toBe(true);
    expect(await verifyWpBcrypt("S0me-Password2", hash)).toBe(false);
  });

  it("校验接受 $2a$/$2b$ 包体(兼容存量/历史签发)", async () => {
    const stored = await hashWpBcrypt("S0me-Password1");
    // stored = "$wp" + "$2y$12$…";替换版本号后仍应通过
    const body = stored.slice(3); // "$2y$12$…"
    for (const ver of ["2a", "2b", "2y"]) {
      const variant = `$wp$${ver}${body.slice(3)}`;
      expect(await verifyWpBcrypt("S0me-Password1", variant)).toBe(true);
    }
  });

  it("非 $wp$ 前缀拒绝(分派职责在调用方,本层双保险)", async () => {
    expect(await verifyWpBcrypt("x", "$P$B12345678abcdefghijklmnopqrstuv")).toBe(false);
    expect(await verifyWpBcrypt("x", "")).toBe(false);
  });

  it("校验路径无 trim(research R2 与生产 verify 一致)", async () => {
    const hash = await hashWpBcrypt("padded "); // 签发侧 trim → 等价于 "padded"
    expect(await verifyWpBcrypt("padded", hash)).toBe(true);
    expect(await verifyWpBcrypt(" padded", hash)).toBe(false); // 校验侧不 trim
  });

  it("HMAC-SHA384 预哈希 defeat bcrypt 72 字节截断", async () => {
    // prehash 输出恒为 64 字符 base64(<72),超长密码尾部差异保留
    const base = "a".repeat(72);
    const h1 = await hashWpBcrypt(`${base}TAIL1`);
    const h2 = await hashWpBcrypt(`${base}TAIL2`);
    expect(h1).not.toBe(h2);
    expect(await verifyWpBcrypt(`${base}TAIL1`, h2)).toBe(false);
  });

  it("prehash 为 base64(HMAC-SHA384('wp-sha384', pwd)) 可复算", () => {
    const expected = crypto
      .createHmac("sha384", "wp-sha384")
      .update("test-input")
      .digest("base64");
    expect(wpPreHash("test-input")).toBe(expected);
  });
});

/**
 * 原生 bcrypt 兼容性门槛(2026-11-06 撞库加固 PR-D):
 * 存量哈希零重写是硬承诺——存量 $wp$2y$12$… 必须能被新实现校验通过。
 */
describe("原生 bcrypt 兼容存量 $wp$ 哈希(PR-D 硬门槛)", () => {
  it("存量样本(bcryptjs 产的 $2y$ 包体)能被原生实现校验通过", async () => {
    // 用 bcryptjs 现路径产一条存量同款哈希(模拟生产存量),再由新实现校验
    const bcryptjs = (await import("bcryptjs")).default;
    const legacy = "$wp" + bcryptjs
      .hashSync(wpPreHash("LegacyPass1"), bcryptjs.genSaltSync(12))
      .replace(/^\$2[ab]\$/, "$2y$");

    expect(legacy).toMatch(/^\$wp\$2y\$12\$/);
    expect(await verifyWpBcrypt("LegacyPass1", legacy)).toBe(true);
    expect(await verifyWpBcrypt("LegacyPass2", legacy)).toBe(false);
  });

  it("原生 bcrypt 直接不吃 $2y$ 包体——改写 minor 位是必需的", async () => {
    // 记录前提:若哪天原生 bcrypt 开始吃 $2y$,本断言会失败并提示可移除改写
    const raw = await bcrypt.hash(wpPreHash("MinorProbe1"), 12);
    expect(raw.startsWith("$2b$")).toBe(true);
    expect(await bcrypt.compare(wpPreHash("MinorProbe1"), `$2y$${raw.slice(4)}`)).toBe(false);
  });

  it("新签发的哈希仍是生产格式 $wp$2y$12$(存储格式零变更)", async () => {
    const hash = await hashWpBcrypt("FreshPass123");
    expect(hash).toMatch(/^\$wp\$2y\$12\$/);
    // 新旧包体互认:bcryptjs 也能校验新签发的哈希(回滚兜底)
    const bcryptjs = (await import("bcryptjs")).default;
    expect(bcryptjs.compareSync(wpPreHash("FreshPass123"), hash.slice(3))).toBe(true);
  });
});
