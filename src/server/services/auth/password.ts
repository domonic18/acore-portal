import "server-only";
import { prisma } from "@/lib/db";
import { authDb } from "@/lib/db/auth";
import { redis } from "@/lib/redis";
import { getConfig } from "@/lib/config";
import { gameShaPassHash, sha256Hex } from "@/lib/auth/game-hash";
import { hashWpBcrypt, verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { verifyPhpass } from "@/lib/auth/phpass";
import {
  PASSWORD_ALGO,
  PHPASS_PREFIX,
  WP_BCRYPT_PREFIX,
} from "@/constants/password";
import { TOKEN_TYPE } from "@/constants/token";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit";
import {
  enqueueMail,
  scheduleDrain,
  checkResendRate,
} from "@/server/services/mail-outbox";
import {
  issueUserToken,
  findLiveUserToken,
  consumeUserToken,
} from "@/server/services/user-token";
import { revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import { isUniqueViolation } from "@/server/http";

/**
 * US3 密码变更服务:
 * 双写顺序=游戏端先写、站点后写(契约:站点新哈希仅在双写成功后生效);
 * 游戏端失败→不标记完成、token 不消费(留待重试)+审计告警(FR-014 禁单边);
 * 成功→吊销全部会话与 refresh(FR-014)。并发用 per-user Redis 锁串行化
 * (跨库无原子性,双请求交错会产生双端不一致)。
 */

export type PasswordChangeFailure =
  | "invalid_token"
  | "bad_current"
  | "weak_password"
  | "banned"
  | "game_sync_failed"
  | "concurrent_change";

export type PasswordChangeOutcome =
  | { ok: true }
  | { ok: false; reason: PasswordChangeFailure; message?: string };

export function validateNewPassword(
  password: string,
  username: string,
): { ok: true } | { ok: false; message: string } {
  if (password.length < 8) {
    return { ok: false, message: "密码至少 8 位。" };
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return { ok: false, message: "密码需同时包含字母和数字。" };
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    return { ok: false, message: "密码不能与用户名相同。" };
  }
  return { ok: true };
}

/** 站点侧哈希前缀分派(与 login 同一权威,research R2) */
function verifySitePassword(storedHash: string, password: string): boolean {
  if (storedHash.startsWith(WP_BCRYPT_PREFIX)) {
    return verifyWpBcrypt(password, storedHash);
  }
  if (storedHash.startsWith(PHPASS_PREFIX)) {
    return verifyPhpass(password, storedHash);
  }
  return false;
}

/** per-user 锁:跨库双写串行化,防并发交错产生双端不一致 */
export async function withPasswordLock<T>(
  userId: bigint,
  fn: () => Promise<T>,
  onLocked: () => T,
): Promise<T> {
  const key = `lock:pw:${userId}`;
  const acquired = await redis.set(key, "1", "EX", 10, "NX");
  if (!acquired) return onLocked();
  try {
    return await fn();
  } finally {
    await redis.del(key);
  }
}

type SiteUser = {
  id: bigint;
  username: string;
  email: string;
  passwordHash: string;
  status: string;
};

/** 游戏端写入;失败抛出 GameSyncError(调用方决定重试语义) */
class GameSyncError extends Error {}

async function writeGamePassword(
  username: string,
  newPassword: string,
): Promise<void> {
  const account = await authDb.findByUsername(username);
  if (!account) throw new GameSyncError("game_account_missing");
  const gameHash = gameShaPassHash(username, newPassword);
  await authDb.updateAccountCredential(account.id, { shaPassHash: gameHash });
}

async function auditDualWriteFailed(
  userId: bigint,
  reason: string,
  ip?: string | null,
): Promise<void> {
  await writeAudit({
    category: AUDIT_CATEGORY.SECURITY,
    action: AUDIT_ACTION.PASSWORD_DUAL_WRITE_FAILED,
    actorUserId: userId,
    payload: { reason },
    ip,
  });
}

async function revokeEverything(userId: bigint): Promise<void> {
  await revokeAllSessions(userId.toString());
  await revokeAllRefreshTokens(userId.toString());
}

// ===== 找回密码 =====

export type ForgotOutcome = { known: boolean; throttled?: boolean };

/** 恒定不泄露邮箱存在性:路由层无论结果都返回同一 202 文案 */
export async function requestPasswordReset(
  emailRaw: string,
  ctx: { ip?: string | null } = {},
): Promise<ForgotOutcome> {
  const email = emailRaw.trim().toLowerCase();
  // key 用邮箱哈希,redis 侧不留 PII
  const keyBase = `rl:pwreset:${sha256Hex(email).slice(0, 24)}`;
  const minute = await hitRateLimit(`${keyBase}:60s`, { windowSec: 60, max: 1 });
  const daily = await hitRateLimit(`${keyBase}:day`, { windowSec: 86400, max: 5 });
  if (!minute.allowed || !daily.allowed) return { known: false, throttled: true };

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, email: true, status: true },
  });
  if (!user) {
    // 契约:不存在仅审计(探测行为留痕,不带邮箱明文)
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.PASSWORD_RESET,
      payload: { stage: "forgot_request", result: "unknown_email" },
      ip: ctx.ip,
    });
    return { known: false };
  }

  // token 入库与邮件入 outbox 同事务原子(research R7/R11)
  const { app } = await getConfig();
  const { plain } = await prisma.$transaction(async (tx) => {
    const issued = await issueUserToken(tx, {
      userId: user.id,
      type: TOKEN_TYPE.PASSWORD_RESET,
    });
    await enqueueMail(tx, {
      to: user.email,
      template: MAIL_TEMPLATE.PASSWORD_RESET,
      payload: {
        username: user.username,
        link: `${app.url}/reset-password?token=${issued.plain}`,
      },
      relatedUserId: user.id,
    });
    return issued;
  });
  scheduleDrain();
  return { known: true };
}

export async function resetPassword(input: {
  tokenPlain: string;
  newPassword: string;
  ip?: string | null;
}): Promise<PasswordChangeOutcome> {
  const row = await findLiveUserToken(prisma, {
    type: TOKEN_TYPE.PASSWORD_RESET,
    plain: input.tokenPlain,
  });
  if (!row) return { ok: false, reason: "invalid_token" };

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: {
      id: true,
      username: true,
      email: true,
      passwordHash: true,
      status: true,
    },
  });
  if (!user || user.status === "banned") {
    return { ok: false, reason: "banned" };
  }
  const policyFull = validateNewPassword(input.newPassword, user.username);
  if (!policyFull.ok) {
    return { ok: false, reason: "weak_password", message: policyFull.message };
  }

  return withPasswordLock<PasswordChangeOutcome>(
    user.id,
    async () => {
      // 先占 token(并发双消费仅一方成功),游戏端失败则释放回"可重试"
      const claimed = await prisma.userToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false as const, reason: "invalid_token" as const };

      try {
        await writeGamePassword(user.username, input.newPassword);
      } catch (err) {
        // 释放占用:链接仍有效,恢复后可重试(不产生单边)
        await prisma.userToken.update({
          where: { id: row.id },
          data: { usedAt: null },
        });
        await auditDualWriteFailed(
          user.id,
          err instanceof GameSyncError ? (err as GameSyncError).message : "game_write_failed",
          input.ip,
        );
        return { ok: false as const, reason: "game_sync_failed" as const };
      }

      const siteHash = hashWpBcrypt(input.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: siteHash, passwordAlgo: PASSWORD_ALGO.BCRYPT_WP },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.PASSWORD_RESET,
        actorUserId: user.id,
        payload: { stage: "completed" },
        ip: input.ip,
      });
      await revokeEverything(user.id);
      return { ok: true as const };
    },
    () => ({ ok: false as const, reason: "concurrent_change" as const }),
  );
}

// ===== 登录态改密 =====

export async function changePassword(input: {
  userId: bigint;
  currentPassword: string;
  newPassword: string;
  ip?: string | null;
}): Promise<PasswordChangeOutcome> {
  const user: SiteUser | null = await prisma.user.findUnique({
    where: { id: input.userId },
    select: {
      id: true,
      username: true,
      email: true,
      passwordHash: true,
      status: true,
    },
  });
  if (!user || user.status === "banned") return { ok: false, reason: "banned" };
  if (!verifySitePassword(user.passwordHash, input.currentPassword)) {
    return { ok: false, reason: "bad_current" };
  }
  const policy = validateNewPassword(input.newPassword, user.username);
  if (!policy.ok) {
    return { ok: false, reason: "weak_password", message: policy.message };
  }

  return withPasswordLock<PasswordChangeOutcome>(
    user.id,
    async () => {
      try {
        await writeGamePassword(user.username, input.newPassword);
      } catch (err) {
        await auditDualWriteFailed(
          user.id,
          err instanceof GameSyncError ? (err as GameSyncError).message : "game_write_failed",
          input.ip,
        );
        return { ok: false as const, reason: "game_sync_failed" as const };
      }

      const siteHash = hashWpBcrypt(input.newPassword);
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: siteHash, passwordAlgo: PASSWORD_ALGO.BCRYPT_WP },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.PASSWORD_CHANGED,
        actorUserId: user.id,
        payload: { via: "settings" },
        ip: input.ip,
      });
      await revokeEverything(user.id);
      return { ok: true as const };
    },
    () => ({ ok: false as const, reason: "concurrent_change" as const }),
  );
}

// ===== 换邮箱(confirm 时刻才生效,FR-021) =====

export type EmailChangeOutcome =
  | { ok: true }
  | {
      ok: false;
      reason: "bad_current" | "same_email" | "email_taken" | "rate_limited";
      retryAfterSec?: number;
    };

export async function requestEmailChange(input: {
  userId: bigint;
  newEmailRaw: string;
  currentPassword: string;
  ip?: string | null;
}): Promise<EmailChangeOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { id: true, username: true, email: true, passwordHash: true },
  });
  if (!user) return { ok: false, reason: "bad_current" };
  if (!verifySitePassword(user.passwordHash, input.currentPassword)) {
    return { ok: false, reason: "bad_current" };
  }
  const newEmail = input.newEmailRaw.trim().toLowerCase();
  if (newEmail === user.email.toLowerCase()) {
    return { ok: false, reason: "same_email" };
  }
  const early = await prisma.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (early && early.id !== user.id) {
    return { ok: false, reason: "email_taken" };
  }
  const gate = await checkResendRate(user.id.toString(), "email_change");
  if (!gate.ok) {
    return { ok: false, reason: "rate_limited", retryAfterSec: gate.retryAfterSec };
  }

  const { app } = await getConfig();
  await prisma.$transaction(async (tx) => {
    const { plain } = await issueUserToken(tx, {
      userId: user.id,
      type: TOKEN_TYPE.EMAIL_CHANGE,
      payload: newEmail,
    });
    await enqueueMail(tx, {
      to: newEmail,
      template: MAIL_TEMPLATE.EMAIL_CHANGE,
      payload: {
        username: user.username,
        link: `${app.url}/account/settings?email_token=${plain}`,
      },
      relatedUserId: user.id,
    });
  });
  scheduleDrain();
  return { ok: true };
}

export type ConfirmEmailOutcome =
  | { ok: true; email: string }
  | { ok: false; reason: "invalid_token" | "email_taken" };

export async function confirmEmailChange(input: {
  tokenPlain: string;
  ip?: string | null;
}): Promise<ConfirmEmailOutcome> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const consumed = await consumeUserToken(tx, {
        type: TOKEN_TYPE.EMAIL_CHANGE,
        plain: input.tokenPlain,
      });
      if (!consumed || !consumed.payload) return null;
      const newEmail = consumed.payload.trim().toLowerCase();
      // 占用查重在 confirm 时刻再验一次(契约 FR-021);唯一索引兜底并发
      await tx.user.update({
        where: { id: consumed.userId },
        data: { email: newEmail },
      });
      return { userId: consumed.userId, email: newEmail };
    });
    if (!result) return { ok: false, reason: "invalid_token" };
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.EMAIL_CHANGE_CONFIRMED,
      actorUserId: result.userId,
      payload: { result: "ok" },
      ip: input.ip,
    });
    return { ok: true, email: result.email };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, reason: "email_taken" };
    throw err;
  }
}
