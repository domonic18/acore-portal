import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/business";
import { authDb } from "@/lib/db/auth";
import { verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { srp6Verifier } from "@/lib/auth/game-hash";
import { PASSWORD_ALGO, PENDING_HASH_PREFIX } from "@/constants/password";
import { AUDIT_ACTION } from "@/constants/audit";
import { POINT_RULE_EVENT, POINT_TX_TYPE } from "@/constants/points";
import { redis } from "@/lib/redis";
import { getSessionFromToken } from "@/lib/auth/session";
import { registerAccount, activateAccount, resendActivation } from "@/server/services/auth/register";
import * as passwordShared from "@/server/services/auth/password/shared";
import { recalculateLedger } from "@/server/services/shared/ledger";
import { getEarnAmount } from "@/server/services/points/rules";
import { loginWithPassword } from "@/server/services/auth/login";

/**
 * US2 集成测试(quickstart S1 + T024):
 * 游戏库失败→整体回滚 0 半成品(SC-004);并发相同用户名仅一成功(FR-009);
 * SUM(amount)=balance 重算(宪法 III);激活链路(占位不可登录→设密→双端同密→激活即登录);
 * 重发作废旧 token;占位过期回收。
 */
const RUN = Date.now().toString(36);
const createdUsers: string[] = [];

async function makeRegisterInput(suffix: number) {
  const username = `t_${RUN}_rg_${suffix}`;
  return { username, email: `${username}@test.local` };
}

async function latestActivateToken(email: string): Promise<string> {
  const mail = await prisma.mailOutbox.findFirstOrThrow({
    where: { toEmail: email, template: "activate" },
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
  // FK 顺序:token/积分/邮件 → user;游戏端走业务库跨库 DELETE(writer 无 DELETE,R5)
  for (const username of createdUsers) {
    const u = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!u) continue;
    await prisma.userToken.deleteMany({ where: { userId: u.id } });
    await prisma.notification.deleteMany({ where: { userId: u.id } });
    await prisma.pointTransaction.deleteMany({ where: { userId: u.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: u.id } });
    await prisma.mailOutbox.deleteMany({ where: { relatedUserId: u.id } });
    await prisma.user.delete({ where: { id: u.id } });
  }
  if (upper.length > 0) {
    await prisma.$executeRaw`
      DELETE FROM acore_auth.account WHERE username IN (${Prisma.join(upper)})
    `;
  }
  await prisma.$disconnect();
  await redis.quit();
});

describe("US2 注册受理(T026/T027/T028)", () => {
  it("受理:占位 user+token+邮件+游戏端建号;未认证通过不发分", async () => {
    const input = await makeRegisterInput(0);
    createdUsers.push(input.username);
    const outcome = await registerAccount(input);
    expect(outcome).toEqual({ ok: true });

    const user = await prisma.user.findUniqueOrThrow({
      where: { username: input.username },
    });
    expect(user.passwordHash.startsWith(PENDING_HASH_PREFIX)).toBe(true);
    expect(user.passwordAlgo).toBe(PASSWORD_ALGO.BCRYPT_WP);

    // 未认证通过(未激活)不发分:占位账号登录不了,注册即发分等于发一份用不了的分
    expect(await prisma.pointTransaction.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.pointAccount.count({ where: { userId: user.id } })).toBe(0);

    // 激活邮件入 outbox(pending)
    const mail = await prisma.mailOutbox.findFirstOrThrow({
      where: { toEmail: input.email, template: "activate" },
    });
    expect(mail.status).toBe("pending");
    expect(await latestActivateToken(input.email)).not.toBe("");

    // 游戏端同名账号(UPPER)
    const game = await authDb.findByUsername(input.username);
    expect(game).not.toBeNull();
    expect(game?.username).toBe(input.username.toUpperCase());

    // 占位不可登录:哈希前缀双不命中
    expect((await loginWithPassword(input.username, "anypassword99")).ok).toBe(false);
  });

  it("游戏端失败→站点整体补偿 0 半成品+审计告警(SC-004)", async () => {
    const input = await makeRegisterInput(1);
    // 补偿后 user 不存在,createdUsers 里查不到也无妨(清理按 findUnique 跳过)
    const spy = vi
      .spyOn(authDb, "createAccount")
      .mockRejectedValueOnce(new Error("mock: game db down"));
    const outcome = await registerAccount(input);
    expect(outcome).toEqual({ ok: false, reason: "game_db_unavailable" });
    expect(spy).toHaveBeenCalledOnce();

    expect(await prisma.user.findUnique({ where: { username: input.username } })).toBeNull();
    expect(await prisma.pointTransaction.count({ where: { user: { username: input.username } } })).toBe(0);
    expect(await prisma.userToken.count({ where: { user: { username: input.username } } })).toBe(0);
    expect(await prisma.mailOutbox.count({ where: { toEmail: input.email } })).toBe(0);
    expect(await authDb.findByUsername(input.username)).toBeNull();

    const alert = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTION.ACCOUNT_DUAL_WRITE_FAILED },
      orderBy: { id: "desc" },
    });
    expect(alert).not.toBeNull();
    expect((alert?.payloadJson as { stage?: string }).stage).toBe("register");
  });

  it("并发相同用户名仅一成功(FR-009)", async () => {
    const input = await makeRegisterInput(2);
    createdUsers.push(input.username);
    const results = await Promise.allSettled([
      registerAccount({ username: input.username, email: input.email }),
      registerAccount({ username: input.username, email: `alt_${input.email}` }),
    ]);
    const fulfilled = results
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof registerAccount>>> => r.status === "fulfilled")
      .map((r) => r.value);
    const okCount = fulfilled.filter((o) => o.ok).length;
    expect(okCount).toBe(1);
    const failed = fulfilled.find((o) => !o.ok);
    expect(failed && !failed.ok && ["username_taken", "username_conflict", "email_taken"].includes(failed.reason)).toBe(true);

    expect(await prisma.user.count({ where: { username: input.username } })).toBe(1);
    expect(await authDb.findByUsername(input.username)).not.toBeNull();
  });

  it("占用拒绝:站点用户名/邮箱、游戏端同名;非法用户名 422", async () => {
    const input = await makeRegisterInput(3);
    createdUsers.push(input.username);
    await registerAccount(input);

    expect(await registerAccount(input)).toEqual({ ok: false, reason: "username_taken" });
    expect(
      await registerAccount({ username: `x_${input.username}`, email: input.email }),
    ).toEqual({ ok: false, reason: "email_taken" });
    expect(
      await registerAccount({ username: input.username.toUpperCase(), email: `u_${input.email}` }),
    ).toEqual({ ok: false, reason: "username_taken" });
    expect(
      await registerAccount({ username: "a@b", email: `bad_${input.email}` }),
    ).toEqual({ ok: false, reason: "invalid_username" });
    expect(await registerAccount({ username: "a", email: `bad2_${input.email}` })).toEqual({
      ok: false,
      reason: "invalid_username",
    });
  });

  it("占位+token 过期:游戏账号在→拒绝且保留站点记录(#65);游戏账号清→回收重注册成功;live token→占用", async () => {
    const input = await makeRegisterInput(4);
    createdUsers.push(input.username);
    await registerAccount(input);
    // 手动过期 token → 站点侧可回收状态
    await prisma.userToken.updateMany({
      where: { user: { username: input.username }, type: "activate" },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    // #65 回归:不手工删除游戏账号的真实过期回收 —— 同名重注册被拒,
    // 且站点占位记录不被先删后败(无孤儿游戏账号、站点数据可追溯)
    const blocked = await registerAccount(input);
    expect(blocked).toEqual({ ok: false, reason: "username_taken" });
    const kept = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });
    expect(kept.passwordHash.startsWith(PENDING_HASH_PREFIX)).toBe(true);
    expect(await authDb.findByUsername(input.username)).not.toBeNull();

    // 游戏账号经人工/运维清理后,同一占位可回收重注册
    await prisma.$executeRaw`DELETE FROM acore_auth.account WHERE username = ${input.username.toUpperCase()}`;
    const again = await registerAccount(input);
    expect(again).toEqual({ ok: true });
    // 回收重注册仍不发分(未认证通过)
    expect(await prisma.pointTransaction.count({ where: { user: { username: input.username } } })).toBe(0);

    // live token 占位 → 占用(还能激活)
    const input2 = await makeRegisterInput(5);
    createdUsers.push(input2.username);
    await registerAccount(input2);
    expect(await registerAccount(input2)).toEqual({ ok: false, reason: "username_taken" });
  });
});

describe("US2 激活设密(T029)", () => {
  it("弱密码拒绝;成功后双端同密、token 一次性、审计、激活即登录", async () => {
    const input = await makeRegisterInput(6);
    createdUsers.push(input.username);
    await registerAccount(input);
    const token = await latestActivateToken(input.email);

    const weak = await activateAccount({ tokenPlain: token, password: "short1" });
    expect(weak).toEqual({ ok: false, reason: "weak_password", message: expect.any(String) });

    const ok = await activateAccount({ tokenPlain: token, password: "Actpass123" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(await getSessionFromToken(ok.accessToken)).not.toBeNull();
    }

    const user = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });
    expect(await verifyWpBcrypt("Actpass123", user.passwordHash)).toBe(true);
    expect(user.passwordHash.startsWith("$wp$")).toBe(true);
    const game = await authDb.findByUsername(input.username);
    expect(
      game && srp6Verifier(input.username, "Actpass123", game.salt).equals(game.verifier),
    ).toBe(true);
    expect((await loginWithPassword(input.username, "Actpass123")).ok).toBe(true);

    // 注册奖励在认证通过时入账:流水 +N、balance_after 快照、SUM=balance(宪法 III)
    const ruleAmount = await getEarnAmount(POINT_RULE_EVENT.REGISTER);
    const txs = await prisma.pointTransaction.findMany({ where: { userId: user.id } });
    if (ruleAmount > 0) {
      expect(txs).toHaveLength(1);
      expect(txs[0]!.amount).toBe(ruleAmount);
      expect(txs[0]!.balanceAfter).toBe(ruleAmount);
      expect(txs[0]!.type).toBe(POINT_TX_TYPE.REGISTER_REWARD);
      expect(txs[0]!.remark).toBe(`新注册并认证通过的账户赠送 ${ruleAmount} 积分`);
      const account = await prisma.pointAccount.findUniqueOrThrow({
        where: { userId: user.id },
      });
      expect(account.balance).toBe(ruleAmount);
      const recalc = await recalculateLedger(user.id);
      expect(recalc.sum).toBe(recalc.balance);
    } else {
      expect(txs).toHaveLength(0);
    }

    const audit = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: AUDIT_ACTION.ACCOUNT_ACTIVATED },
    });
    expect(audit).not.toBeNull();

    // 一次性:复用失效
    expect(await activateAccount({ tokenPlain: token, password: "Again12345" })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
  });

  it("激活时游戏端失败→token 释放可重试,恢复后同一链接成功", async () => {
    const input = await makeRegisterInput(7);
    createdUsers.push(input.username);
    await registerAccount(input);
    const token = await latestActivateToken(input.email);

    vi.spyOn(authDb, "updateAccountCredential").mockRejectedValueOnce(
      new Error("mock: game db down"),
    );
    const failed = await activateAccount({ tokenPlain: token, password: "Late12345" });
    expect(failed).toEqual({ ok: false, reason: "game_db_unavailable" });

    const retried = await activateAccount({ tokenPlain: token, password: "Late12345" });
    expect(retried.ok).toBe(true);
  });

  it("激活时游戏端成功后站点失败→token 释放+游戏回滚+同一链接可重试", async () => {
    const input = await makeRegisterInput(8);
    createdUsers.push(input.username);
    await registerAccount(input);
    const token = await latestActivateToken(input.email);
    const beforeGame = await authDb.findByUsername(input.username);

    const updateSpy = vi
      .spyOn(passwordShared, "writeSitePassword")
      .mockRejectedValueOnce(new Error("mock: site db down"));
    const failed = await activateAccount({ tokenPlain: token, password: "Split12345" });
    expect(failed).toEqual({ ok: false, reason: "game_db_unavailable" });
    updateSpy.mockRestore();

    // token 已释放
    const tokenRow = await prisma.userToken.findFirstOrThrow({
      where: { user: { username: input.username }, type: "activate" },
    });
    expect(tokenRow.usedAt).toBeNull();

    // 游戏端回滚,占位仍不可登录
    expect(beforeGame).not.toBeNull();
    const afterGame = await authDb.findByUsername(input.username);
    expect(
      afterGame &&
        Buffer.compare(Buffer.from(afterGame.salt), Buffer.from(beforeGame!.salt)) === 0 &&
        Buffer.compare(Buffer.from(afterGame.verifier), Buffer.from(beforeGame!.verifier)) === 0,
    ).toBe(true);
    const user = await prisma.user.findUniqueOrThrow({ where: { username: input.username } });
    expect(user.passwordHash.startsWith(PENDING_HASH_PREFIX)).toBe(true);
    expect((await loginWithPassword(input.username, "Split12345")).ok).toBe(false);

    const failedAudit = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_FAILED },
    });
    expect(failedAudit).not.toBeNull();
    expect((failedAudit?.payloadJson as { reason?: string }).reason).toMatch(/^site_write_failed:/);

    const recoveredAudit = await prisma.auditLog.findFirst({
      where: { actorUserId: user.id, action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_RECOVERED },
    });
    expect(recoveredAudit).not.toBeNull();

    // 同一链接重试成功
    const retried = await activateAccount({ tokenPlain: token, password: "Split12345" });
    expect(retried.ok).toBe(true);
  });
});

describe("US2 激活邮件重发(T030)", () => {
  it("重发作废旧 token,新 token 可激活;限速生效", async () => {
    const input = await makeRegisterInput(9);
    createdUsers.push(input.username);
    await registerAccount(input);
    const oldToken = await latestActivateToken(input.email);

    const resent = await resendActivation(input.email);
    expect(resent).toEqual({ known: true });
    const newToken = await latestActivateToken(input.email);
    expect(newToken).not.toBe(oldToken);

    // 限速:同用户同模板 60s 内第二次拒绝(须在激活前,激活后不可再重发)
    const throttled = await resendActivation(input.email);
    expect(throttled).toEqual({ known: true, throttled: true, retryAfterSec: expect.any(Number) });

    // 旧 token 已被再签发作废
    expect(await activateAccount({ tokenPlain: oldToken, password: "Reset12345" })).toEqual({
      ok: false,
      reason: "invalid_token",
    });
    // 新 token 可激活
    expect((await activateAccount({ tokenPlain: newToken, password: "Reset12345" })).ok).toBe(
      true,
    );
  });

  it("非占位/未知邮箱:known=false,不发信", async () => {
    const ghost = `nobody_${RUN}_rg@test.local`;
    expect(await resendActivation(ghost)).toEqual({ known: false });
    expect(await prisma.mailOutbox.count({ where: { toEmail: ghost } })).toBe(0);
  });
});
