import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { hashPhpass } from "@/lib/auth/phpass";
import { hashWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO } from "@/constants/password";
import { loginWithPassword } from "@/server/services/auth/login";
import { AUDIT_ACTION } from "@/constants/audit";

/**
 * US1 集成测试(quickstart S2 本地预演):
 * phpass 登录透明升级 + $wp$ 零接触 + 统一失败语义 + 并发竞态防护。
 * 自建隔离用户(唯一后缀),不依赖 seed,afterAll 清理。
 */
const RUN = Date.now().toString(36);
const created: string[] = [];

async function makeUser(input: {
  algo: "phpass" | "bcrypt_wp";
  status?: "active" | "banned";
}) {
  const username = `t_${RUN}_${input.algo}_${created.length}`;
  const passwordHash =
    input.algo === "phpass"
      ? hashPhpass("oldpass123")
      : hashWpBcrypt("oldpass456");
  const user = await prisma.user.create({
    data: {
      username,
      email: `${username}@test.local`,
      passwordHash,
      passwordAlgo: input.algo,
      status: input.status ?? "active",
    },
  });
  created.push(username);
  return user;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`; // 服务不可达时快速失败(先 make up)
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { username: { in: created } } });
  await prisma.$disconnect();
});

describe("US1 存量无感登录(quickstart S2)", () => {
  it("phpass 存量账号:登录成功 → 哈希重写 bcrypt_wp + 审计 hash_upgraded", async () => {
    const u = await makeUser({ algo: "phpass" });
    const before = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    expect(before.passwordHash).toMatch(/^\$P\$B/);

    const outcome = await loginWithPassword(u.username, "oldpass123");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.upgraded).toBe(true);

    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true, passwordAlgo: true },
    });
    expect(after.passwordHash).toMatch(/^\$wp\$2y\$12\$/);
    expect(after.passwordAlgo).toBe(PASSWORD_ALGO.BCRYPT_WP);

    const audit = await prisma.auditLog.findFirst({
      where: {
        actorUserId: u.id,
        action: AUDIT_ACTION.HASH_UPGRADED,
      },
    });
    expect(audit).not.toBeNull();
  });

  it("二次登录走新哈希路径:成功且 upgraded=false", async () => {
    const u = await makeUser({ algo: "phpass" });
    await loginWithPassword(u.username, "oldpass123");
    const second = await loginWithPassword(u.username, "oldpass123");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.upgraded).toBe(false);
  });

  it("$wp$ 存量账号:登录成功且哈希原样未动(零接触)", async () => {
    const u = await makeUser({ algo: "bcrypt_wp" });
    const before = (
      await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
        select: { passwordHash: true },
      })
    ).passwordHash;

    const outcome = await loginWithPassword(u.username, "oldpass456");
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.upgraded).toBe(false);

    const after = (
      await prisma.user.findUniqueOrThrow({
        where: { id: u.id },
        select: { passwordHash: true },
      })
    ).passwordHash;
    expect(after).toBe(before);
  });

  it("错误密码:统一 bad_password + 审计 login_failed(仅审计可见真实原因)", async () => {
    const u = await makeUser({ algo: "bcrypt_wp" });
    const outcome = await loginWithPassword(u.username, "wrongpass999");
    expect(outcome).toEqual({ ok: false, failReason: "bad_password" });
    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: u.id, action: AUDIT_ACTION.LOGIN_FAILED },
    });
    expect(audit).not.toBeNull();
  });

  it("封禁账号:拒绝且原因 banned", async () => {
    const u = await makeUser({ algo: "bcrypt_wp", status: "banned" });
    const outcome = await loginWithPassword(u.username, "oldpass456");
    expect(outcome).toEqual({ ok: false, failReason: "banned" });
  });

  it("并发透明升级竞态:同密码双请求都成功,仅一方升级(风险#4 防护)", async () => {
    const u = await makeUser({ algo: "phpass" });
    const [a, b] = await Promise.all([
      loginWithPassword(u.username, "oldpass123"),
      loginWithPassword(u.username, "oldpass123"),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    expect(after.passwordHash).toMatch(/^\$wp\$/);
    // 最终仍可登录(新哈希路径)
    const third = await loginWithPassword(u.username, "oldpass123");
    expect(third.ok).toBe(true);
  });
});
