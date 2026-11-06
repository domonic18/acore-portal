import "server-only";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { TOKEN_TYPE } from "@/constants/token";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import {
  checkResendRate,
  enqueueMail,
  scheduleDrain,
} from "@/server/services/shared/mail-outbox";
import {
  consumeUserToken,
  issueUserToken,
} from "@/server/services/shared/user-token";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { isUniqueViolation } from "@/server/http";
import {
  auditDualWriteFailed,
  auditDualWriteRecovered,
  GameSyncError,
  restoreGameCredential,
  revokeEverything,
  validateNewPassword,
  verifySitePassword,
  withPasswordLock,
  writeGamePassword,
  writeSitePassword,
  type GameCredential,
  type PasswordChangeOutcome,
  type SiteUser,
} from "./shared";

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
  if (!(await verifySitePassword(user.passwordHash, input.currentPassword))) {
    return { ok: false, reason: "bad_current" };
  }
  const policy = validateNewPassword(input.newPassword, user.username);
  if (!policy.ok) {
    return { ok: false, reason: "weak_password", message: policy.message };
  }

  return withPasswordLock<PasswordChangeOutcome>(
    user.id,
    async () => {
      let accountId: number;
      let previous: GameCredential;
      try {
        ({ accountId, previous } = await writeGamePassword(user.username, input.newPassword));
      } catch (err) {
        await auditDualWriteFailed(
          user.id,
          err instanceof GameSyncError ? (err as GameSyncError).message : "game_write_failed",
          input.ip,
        );
        return { ok: false as const, reason: "game_sync_failed" as const };
      }

      try {
        await writeSitePassword(user.id, input.newPassword);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "site_write_failed";
        try {
          await restoreGameCredential(accountId, previous);
          await auditDualWriteFailed(user.id, `site_write_failed:${reason}`, input.ip);
          await auditDualWriteRecovered(user.id, "game_rollback_succeeded", input.ip);
        } catch (rollbackErr) {
          const rollbackReason = rollbackErr instanceof Error ? rollbackErr.message : "unknown";
          await auditDualWriteFailed(user.id, `rollback_failed:${rollbackReason}`, input.ip);
        }
        return { ok: false as const, reason: "game_sync_failed" as const };
      }

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
  if (!(await verifySitePassword(user.passwordHash, input.currentPassword))) {
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
