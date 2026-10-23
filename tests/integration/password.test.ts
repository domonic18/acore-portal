import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { hashWpBcrypt, verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { gameShaPassHash, sha256Hex } from "@/lib/auth/game-hash";
import { PASSWORD_ALGO } from "@/constants/password";
import { AUDIT_ACTION } from "@/constants/audit";
import { redis } from "@/lib/redis";
import {
  changePassword,
  confirmEmailChange,
  requestEmailChange,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/auth/password";
import {
  createSession,
  getSessionFromToken,
  issueRefreshToken,
  consumeRefreshToken,
} from "@/lib/auth/session";
import { loginWithPassword } from "@/server/services/auth/login";

/**
 * US3 集成测试(quickstart S3):
 * 改密/找回双写一致(SC-003)、游戏端失败→不标记完成+审计告警+恢复后重试成功(FR-014)、
 * token 一次性/过期/再签作废(R11)、改密后旧会话全部吊销。
 * 自建隔离用户(唯一后缀),站点+游戏端两侧建号,afterAll 双侧清理。
 */
const RUN = Date.now().toString(36);
const createdUsers: string[] = [];

async function makeUser(input: { withGame?: boolean } = {}) {
  const username = `t_${RUN}_pw_${createdUsers.length}`;
  const email = `${username}@test.local`;
  const user = await prisma.user.create({
    data: {
      username,
      email,
      passwordHash: hashWpBcrypt("oldpass456"),
      passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
    },
  });
  createdUsers.push(username);
  if (input.withGame !== false) {
    // 游戏端建号(走 R5 契约方法,username 约定 UPPER)
    await authDb.createAccount({
      username,
      email,
      shaPassHash: gameShaPassHash(username, "oldpass456"),
    });
  }
  return { ...user, username, email };
}

/** 清除找回限速门(测试隔离用,与服务 key 算法一致) */
async function clearResetGate(email: string) {
  const base = `rl:pwreset:${sha256Hex(email).slice(0, 24)}`;
  await redis.del(`${base}:60s`, `${base}:day`);
}

async function latestResetToken(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirstOrThrow({
    where: { toEmail: email, template: "password_reset" },
    orderBy: { id: "desc" },
  });
  const payload = mail.payloadJson as { link: string };
  return new URL(payload.link).searchParams.get("token") ?? "";
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
});

afterAll(async () => {
  const upper = createdUsers.map((u) => u.toUpperCase());
  // FK 顺序:userToken(restrict)→mailOutbox→user
  await prisma.userToken.deleteMany({
    where: { user: { username: { in: createdUsers } } },
  });
  await prisma.mailOutbox.deleteMany({
    where: { toEmail: { in: createdUsers.map((u) => `${u}@test.local`) } },
  });
  await prisma.user.deleteMany({ where: { username: { in: createdUsers } } });
  // writer 账号无 DELETE(R5 授权即防线);业务账号有全库权限,清理走跨库 SQL
  await prisma.$executeRaw`
    DELETE FROM acore_auth.account WHERE username IN (${Prisma.join(upper)})
  `;
  await prisma.$disconnect();
  await redis.quit();
});

describe("US3 改密双写(quickstart S3)", () => {
  it("登录态改密:站点+游戏端一致,双端新密可过、旧密失效、审计留痕", async () => {
    const u = await makeUser();
    const outcome = await changePassword({
      userId: u.id,
      currentPassword: "oldpass456",
      newPassword: "Newpass123",
    });
    expect(outcome).toEqual({ ok: true });

    const site = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true, passwordAlgo: true },
    });
    expect(verifyWpBcrypt("Newpass123", site.passwordHash)).toBe(true);
    expect(site.passwordAlgo).toBe(PASSWORD_ALGO.BCRYPT_WP);

    const game = await authDb.findByUsername(u.username);
    expect(game?.shaPassHash).toBe(gameShaPassHash(u.username, "Newpass123"));

    expect((await loginWithPassword(u.username, "Newpass123")).ok).toBe(true);
    expect((await loginWithPassword(u.username, "oldpass456")).ok).toBe(false);

    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: u.id, action: AUDIT_ACTION.PASSWORD_CHANGED },
    });
    expect(audit).not.toBeNull();
  });

  it("当前密码错误→bad_current,两侧均不变", async () => {
    const u = await makeUser();
    const beforeSite = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    const beforeGame = (await authDb.findByUsername(u.username))?.shaPassHash;

    const outcome = await changePassword({
      userId: u.id,
      currentPassword: "wrongpass999",
      newPassword: "Newpass123",
    });
    expect(outcome).toEqual({ ok: false, reason: "bad_current" });

    const afterSite = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    expect(afterSite.passwordHash).toBe(beforeSite.passwordHash);
    expect((await authDb.findByUsername(u.username))?.shaPassHash).toBe(beforeGame);
  });

  it("弱密码拒绝:短/无数字/同用户名", async () => {
    const u = await makeUser();
    for (const weak of ["short1", "nodigitpassword", u.username]) {
      const outcome = await changePassword({
        userId: u.id,
        currentPassword: "oldpass456",
        newPassword: weak,
      });
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.reason).toBe("weak_password");
    }
  });

  it("游戏端写入失败→不标记完成+审计告警;恢复后重试成功(FR-014)", async () => {
    const u = await makeUser();
    const beforeSite = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    const beforeGame = (await authDb.findByUsername(u.username))?.shaPassHash;

    const spy = vi
      .spyOn(authDb, "updateAccountCredential")
      .mockRejectedValueOnce(new Error("mock: game db down"));
    const failed = await changePassword({
      userId: u.id,
      currentPassword: "oldpass456",
      newPassword: "Retry123",
    });
    expect(failed).toEqual({ ok: false, reason: "game_sync_failed" });

    // 单边都不产生
    const midSite = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { passwordHash: true },
    });
    expect(midSite.passwordHash).toBe(beforeSite.passwordHash);
    expect((await authDb.findByUsername(u.username))?.shaPassHash).toBe(beforeGame);

    const alert = await prisma.auditLog.findFirst({
      where: {
        actorUserId: u.id,
        action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_FAILED,
      },
    });
    expect(alert).not.toBeNull();

    // "恢复"(spy 一次性已消耗)后重试成功
    const retried = await changePassword({
      userId: u.id,
      currentPassword: "oldpass456",
      newPassword: "Retry123",
    });
    expect(retried).toEqual({ ok: true });
    const game = await authDb.findByUsername(u.username);
    expect(game?.shaPassHash).toBe(gameShaPassHash(u.username, "Retry123"));
  });

  it("改密后旧会话与 refresh 全部吊销(FR-014)", async () => {
    const u = await makeUser();
    const { accessToken, payload } = await createSession(u.id, "user");
    const { token: refresh } = await issueRefreshToken(u.id);

    const outcome = await changePassword({
      userId: u.id,
      currentPassword: "oldpass456",
      newPassword: "Revoke123",
    });
    expect(outcome).toEqual({ ok: true });

    expect(await getSessionFromToken(accessToken)).toBeNull();
    expect(payload.jti).toBeTruthy();
    expect(await consumeRefreshToken(u.id, refresh)).toBeNull();
  });
});

describe("US3 找回密码(quickstart S3 + R11)", () => {
  it("全链路:申请→outbox 邮件→30min 链接重置→一次性(复用失效)", async () => {
    const u = await makeUser();
    await clearResetGate(u.email);
    const asked = await requestPasswordReset(u.email.toUpperCase());
    expect(asked.known).toBe(true);

    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { toEmail: u.email, template: "password_reset" },
    });
    expect(mail.status).toBe("pending");

    const token = await latestResetToken(u.email);
    const outcome = await resetPassword({ tokenPlain: token, newPassword: "Reset123" });
    expect(outcome).toEqual({ ok: true });

    const game = await authDb.findByUsername(u.username);
    expect(game?.shaPassHash).toBe(gameShaPassHash(u.username, "Reset123"));
    expect((await loginWithPassword(u.username, "Reset123")).ok).toBe(true);

    // 一次性:同一 token 复用 → invalid_token,密码不再变化
    const reuse = await resetPassword({
      tokenPlain: token,
      newPassword: "Again12345",
    });
    expect(reuse).toEqual({ ok: false, reason: "invalid_token" });
    expect((await loginWithPassword(u.username, "Again12345")).ok).toBe(false);
  });

  it("过期 token 拒绝;审计重置完成留痕", async () => {
    const u = await makeUser();
    await clearResetGate(u.email);
    await requestPasswordReset(u.email);
    const row = await prisma.userToken.findFirstOrThrow({
      where: { user: { username: u.username }, type: "password_reset" },
    });
    await prisma.userToken.update({
      where: { id: row.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const outcome = await resetPassword({
      tokenPlain: "x".repeat(43),
      newPassword: "Reset123",
    });
    // 先走哈希未命中 → invalid_token(过期与不存在同一对外语义,防枚举)
    expect(outcome).toEqual({ ok: false, reason: "invalid_token" });

    await clearResetGate(u.email);
    await requestPasswordReset(u.email);
    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { toEmail: u.email, template: "password_reset" },
      orderBy: { id: "desc" },
    });
    const token = new URL((mail.payloadJson as { link: string }).link).searchParams.get("token") ?? "";
    const expired = await prisma.userToken.findFirstOrThrow({
      where: { user: { username: u.username }, type: "password_reset" },
      orderBy: { id: "desc" },
    });
    await prisma.userToken.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const late = await resetPassword({ tokenPlain: token, newPassword: "Reset123" });
    expect(late).toEqual({ ok: false, reason: "invalid_token" });
  });

  it("再签作废:第二次申请后旧链接失效(R11)", async () => {
    const u = await makeUser();
    await clearResetGate(u.email);
    await requestPasswordReset(u.email);
    const firstToken = await latestResetToken(u.email);

    await clearResetGate(u.email);
    await requestPasswordReset(u.email);
    const secondToken = await latestResetToken(u.email);
    expect(secondToken).not.toBe(firstToken);

    const oldGone = await resetPassword({
      tokenPlain: firstToken,
      newPassword: "Newest123",
    });
    expect(oldGone).toEqual({ ok: false, reason: "invalid_token" });

    const fresh = await resetPassword({
      tokenPlain: secondToken,
      newPassword: "Newest123",
    });
    expect(fresh).toEqual({ ok: true });
  });

  it("未知邮箱:恒定不落库不发包,仅审计留痕", async () => {
    const ghost = `nobody_${RUN}@test.local`;
    const outcome = await requestPasswordReset(ghost);
    expect(outcome.known).toBe(false);
    const mails = await prisma.mailOutbox.count({ where: { toEmail: ghost } });
    expect(mails).toBe(0);
  });

  it("重置时游戏端失败→token 保留可重试,恢复后同一链接成功", async () => {
    const u = await makeUser();
    await clearResetGate(u.email);
    await requestPasswordReset(u.email);
    const token = await latestResetToken(u.email);

    vi.spyOn(authDb, "updateAccountCredential").mockRejectedValueOnce(
      new Error("mock: game db down"),
    );
    const failed = await resetPassword({ tokenPlain: token, newPassword: "Late1234" });
    expect(failed).toEqual({ ok: false, reason: "game_sync_failed" });

    // token 已释放回可重试(不标记完成)
    const retried = await resetPassword({ tokenPlain: token, newPassword: "Late1234" });
    expect(retried).toEqual({ ok: true });
  });
});

describe("US3 换邮箱(FR-021)", () => {
  it("确认时刻生效:申请→新邮箱收信→confirm 换绑→token 复用失效", async () => {
    const u = await makeUser();
    const outcome = await requestEmailChange({
      userId: u.id,
      newEmailRaw: `new_${u.username}@test.local`,
      currentPassword: "oldpass456",
    });
    expect(outcome).toEqual({ ok: true });

    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { toEmail: `new_${u.username}@test.local`, template: "email_change" },
    });
    const token = new URL((mail.payloadJson as { link: string }).link).searchParams.get(
      "email_token",
    ) ?? "";

    const confirmed = await confirmEmailChange({ tokenPlain: token });
    expect(confirmed.ok).toBe(true);
    const after = await prisma.user.findUniqueOrThrow({
      where: { id: u.id },
      select: { email: true },
    });
    expect(after.email).toBe(`new_${u.username}@test.local`);

    expect(await confirmEmailChange({ tokenPlain: token })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("当前密码错误拒绝;confirm 时刻占用冲突→email_taken", async () => {
    const u = await makeUser();
    const wrong = await requestEmailChange({
      userId: u.id,
      newEmailRaw: `x_${u.username}@test.local`,
      currentPassword: "nope",
    });
    expect(wrong).toEqual({ ok: false, reason: "bad_current" });

    // 申请时邮箱空闲,confirm 前被他人占用 → 冲突
    await requestEmailChange({
      userId: u.id,
      newEmailRaw: `race_${u.username}@test.local`,
      currentPassword: "oldpass456",
    });
    const rival = await makeUser();
    await prisma.user.update({
      where: { id: rival.id },
      data: { email: `race_${u.username}@test.local` },
    });
    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { toEmail: `race_${u.username}@test.local`, template: "email_change" },
      orderBy: { id: "desc" },
    });
    const token = new URL((mail.payloadJson as { link: string }).link).searchParams.get(
      "email_token",
    ) ?? "";
    expect(await confirmEmailChange({ tokenPlain: token })).toEqual({
      ok: false,
      reason: "email_taken",
    });
  });
});
