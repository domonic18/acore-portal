import { describe, expect, it } from "vitest";
import { hashWpPassword, wpPreHash } from "../../scripts/migrate/lib/admin.mjs";
import { hashWpBcrypt, verifyWpBcrypt, wpPreHash as appPreHash } from "@/lib/auth/wp-bcrypt";

/**
 * 切换期管理员引导的口令哈希必须与登录校验路径逐字节同构
 * (src/lib/auth/wp-bcrypt.ts)。两处实现分家 → 管理员建好后登不进去,
 * 故此处直接对齐断言,防漂移。
 */
describe("迁移管理员口令哈希", () => {
  it("prehash 与 app 实现逐字节一致", () => {
    const samples = ["pw", "  spaced  ", "中文口令", "a".repeat(80), ""];
    for (const s of samples) {
      expect(wpPreHash(s)).toBe(appPreHash(s));
      expect(wpPreHash(s, true)).toBe(appPreHash(s, true));
    }
  });

  it("生成的哈希能被 app 的校验函数验证通过", async () => {
    const stored = await hashWpPassword("rehearsal-pw-123");
    expect(stored.startsWith("$wp$2y$")).toBe(true);
    expect(await verifyWpBcrypt("rehearsal-pw-123", stored)).toBe(true);
    expect(await verifyWpBcrypt("wrong-pw", stored)).toBe(false);
  });

  it("与 app 的签发函数产出同构(仅随机盐不同)", async () => {
    const a = await hashWpPassword("same-pw");
    const b = await hashWpBcrypt("same-pw");
    // 前缀与 cost 位一致(仅盐与哈希体随机部分不同)
    expect(a.slice(0, 10)).toBe(b.slice(0, 10));
  });
});
