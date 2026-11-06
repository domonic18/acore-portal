import { describe, expect, it } from "vitest";
import { hashWpBcrypt } from "@/lib/auth/wp-bcrypt";
import {
  isDenyListedPassword,
  isUsernameDerivedPassword,
  normalizeForDeny,
  validateNewPassword,
} from "@/server/services/auth/password/policy";

/**
 * 口令策略(撞库加固 PR-F):
 * 单测只覆盖纯函数口径——弱口令表的归一、用户名相似、旧密码复用。
 * 三条链路的集成行为另见 tests/integration/password.test.ts。
 */
describe("弱口令表归一口径", () => {
  it("大小写不敏感", () => {
    expect(normalizeForDeny("PassWord")).toBe("password");
    expect(isDenyListedPassword("PASSWORD")).toBe(true);
    expect(isDenyListedPassword("PaSsWoRd")).toBe(true);
  });

  it("去数字后命中:abc123456 命中表中的 abc123", () => {
    expect(isDenyListedPassword("abc123")).toBe(true);
    expect(isDenyListedPassword("abc123456")).toBe(true);
    expect(isDenyListedPassword("abc")).toBe(true);
  });

  it("常见符号还原:@→a、$→s", () => {
    expect(normalizeForDeny("p@ssw0rd")).toBe("passwrd");
    expect(isDenyListedPassword("p@ssw0rd")).toBe(true);
    expect(isDenyListedPassword("pa$$word")).toBe(true);
  });

  it("纯数字一律拒绝(不靠逐个列举)", () => {
    expect(isDenyListedPassword("12345678")).toBe(true);
    expect(isDenyListedPassword("87654321")).toBe(true);
    expect(isDenyListedPassword("20261106")).toBe(true);
  });

  it("正常口令不误伤", () => {
    expect(isDenyListedPassword("Correct-Horse-7")).toBe(false);
    expect(isDenyListedPassword("mango7Sky")).toBe(false);
  });
});

describe("用户名相似判定", () => {
  it("完全相同 → 判定为相似", () => {
    expect(isUsernameDerivedPassword("Deadwalk", "deadwalk")).toBe(true);
  });

  it("包含用户名 → 判定为相似(含「用户名+数字后缀」变体)", () => {
    expect(isUsernameDerivedPassword("deadwalk123", "deadwalk")).toBe(true);
    expect(isUsernameDerivedPassword("xxdeadwalkxx", "deadwalk")).toBe(true);
    expect(isUsernameDerivedPassword("Deadwalk!", "deadwalk")).toBe(true);
  });

  it("用户名过短时不判定「包含」(2 位用户名的包含面会误伤正常口令)", () => {
    expect(isUsernameDerivedPassword("banana99", "an")).toBe(false);
    expect(isUsernameDerivedPassword("an", "an")).toBe(true);
  });
});

describe("validateNewPassword", () => {
  it("沿用既有规则:长度不足 / 无数字 / 无字母 → 拒绝", async () => {
    expect((await validateNewPassword("Ab1", "user")).ok).toBe(false);
    expect((await validateNewPassword("nodigitpassword", "user")).ok).toBe(false);
    expect((await validateNewPassword("12345678", "user")).ok).toBe(false);
  });

  it("弱口令 → 拒绝;正常口令 → 通过", async () => {
    expect((await validateNewPassword("password123", "user")).ok).toBe(false);
    expect((await validateNewPassword("Correct-Horse-7", "user")).ok).toBe(true);
  });

  it("含用户名 → 拒绝", async () => {
    expect((await validateNewPassword("Deadwalk2024", "deadwalk")).ok).toBe(false);
  });

  it("复用旧密码 → 拒绝;换新密码 → 通过", async () => {
    const previousHash = await hashWpBcrypt("Oldpass123");
    expect((await validateNewPassword("Oldpass123", "user", { previousHash })).ok).toBe(false);
    expect((await validateNewPassword("Brandnew456", "user", { previousHash })).ok).toBe(true);
  });

  it("不传 previousHash 时不做复用判定(激活设密无旧密码)", async () => {
    expect((await validateNewPassword("Oldpass123", "user")).ok).toBe(true);
  });
});
