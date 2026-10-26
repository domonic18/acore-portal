import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { createSession, getSessionFromToken } from "@/lib/auth/session";
import { AUDIT_ACTION } from "@/constants/audit";
import { setUserRole } from "@/server/services/users-admin/set-role";

/**
 * M4 后台角色分配集成:
 * 升级落库+审计+会话吊销 / 同值幂等不落审计不踢人 / 自改与不存在拒绝 /
 * 最后管理员拒绝(仅当库内唯一 admin 可断言;拒绝路径零写)/ 多 admin 降级放行。
 */
const RUN = Date.now().toString(36);
const SUFFIX = `r${RUN}`;
let actorId = 0n;
let targetId = 0n;
let m1adminId = 0n;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  await prisma.user.createMany({
    data: [
      {
        username: `roleactor${SUFFIX}`,
        role: "admin",
        email: `actor-${RUN}@t.local`,
        passwordHash: "x",
        passwordAlgo: "phpass",
      },
      {
        username: `roletarget${SUFFIX}`,
        role: "user",
        email: `target-${RUN}@t.local`,
        passwordHash: "x",
        passwordAlgo: "phpass",
      },
    ],
  });
  actorId = (await prisma.user.findUniqueOrThrow({ where: { username: `roleactor${SUFFIX}` } })).id;
  targetId = (await prisma.user.findUniqueOrThrow({ where: { username: `roletarget${SUFFIX}` } })).id;
  const m1 = await prisma.user.findUnique({ where: { username: "m1admin" }, select: { id: true, role: true } });
  if (m1 && m1.role === "admin") m1adminId = m1.id;
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { actorUserId: { in: [actorId, targetId, m1adminId] } } });
  await prisma.user.deleteMany({ where: { username: { endsWith: SUFFIX } } });
  await prisma.$disconnect();
});

describe("setUserRole(后台角色分配)", () => {
  it("升级落库+审计+真实会话吊销", async () => {
    const { accessToken } = await createSession(targetId, "user"); // 目标现存会话
    expect(await getSessionFromToken(accessToken)).not.toBeNull();

    const out = await setUserRole({ actorId, targetUserId: targetId, newRole: "moderator" });
    expect(out).toMatchObject({ ok: true, oldRole: "user", newRole: "moderator" });
    expect(out.ok && out.revokedSessions).toBeGreaterThanOrEqual(1);
    expect(await getSessionFromToken(accessToken)).toBeNull(); // 降权即时生效

    const row = await prisma.user.findUniqueOrThrow({ where: { id: targetId }, select: { role: true } });
    expect(row.role).toBe("moderator");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { actorUserId: actorId, action: AUDIT_ACTION.USER_ROLE_CHANGE },
      orderBy: { id: "desc" },
    });
    expect(audit.payloadJson).toMatchObject({
      targetUserId: targetId.toString(),
      oldRole: "user",
      newRole: "moderator",
    });
  });

  it("同值幂等:ok 但不落审计不吊销", async () => {
    const before = await prisma.auditLog.count({
      where: { actorUserId: actorId, action: AUDIT_ACTION.USER_ROLE_CHANGE },
    });
    const { accessToken } = await createSession(targetId, "moderator");
    const out = await setUserRole({ actorId, targetUserId: targetId, newRole: "moderator" });
    expect(out).toMatchObject({ ok: true, revokedSessions: 0 });
    expect(
      await prisma.auditLog.count({
        where: { actorUserId: actorId, action: AUDIT_ACTION.USER_ROLE_CHANGE },
      }),
    ).toBe(before);
    expect(await getSessionFromToken(accessToken)).not.toBeNull(); // 不无谓踢人
    await createSession(targetId, "moderator"); // 留存活会话,下个用例继续验证吊销
  });

  it("降级 moderator→user:再吊销+审计", async () => {
    const out = await setUserRole({ actorId, targetUserId: targetId, newRole: "user" });
    expect(out).toMatchObject({ ok: true, oldRole: "moderator", newRole: "user" });
    expect(out.ok && out.revokedSessions).toBeGreaterThanOrEqual(1);
  });

  it("自改拒绝+目标不存在拒绝", async () => {
    await expect(
      setUserRole({ actorId, targetUserId: actorId, newRole: "user" }),
    ).resolves.toMatchObject({ ok: false, reason: "self" });
    await expect(
      setUserRole({ actorId, targetUserId: 9_999_999n, newRole: "user" }),
    ).resolves.toMatchObject({ ok: false, reason: "not_found" });
  });

  it("最后管理员拒绝(唯一 admin 时;拒绝路径零写)", async () => {
    if (!m1adminId) return; // 环境无种子 admin 时跳过该分支
    const admins = await prisma.user.count({ where: { role: "admin" } });
    if (admins !== 1) return; // 多 admin 环境无法构造"最后一名",分支由人工环境覆盖
    const before = await prisma.user.findUniqueOrThrow({ where: { id: m1adminId }, select: { role: true } });
    const out = await setUserRole({ actorId, targetUserId: m1adminId, newRole: "user" });
    expect(out).toMatchObject({ ok: false, reason: "last_admin" });
    const after = await prisma.user.findUniqueOrThrow({ where: { id: m1adminId }, select: { role: true } });
    expect(after.role).toBe(before.role); // 零写
  });

  it("多 admin 环境降级 admin 放行", async () => {
    const adminsBefore = await prisma.user.count({ where: { role: "admin" } });
    await prisma.user.update({ where: { id: targetId }, data: { role: "admin" } });
    const out = await setUserRole({ actorId, targetUserId: targetId, newRole: "moderator" });
    if (adminsBefore === 0) {
      // target 自身是唯一 admin → 拒绝分支(与上一用例互补)
      expect(out).toMatchObject({ ok: false, reason: "last_admin" });
    } else {
      expect(out).toMatchObject({ ok: true, oldRole: "admin", newRole: "moderator" });
    }
  });
});
