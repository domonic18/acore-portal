import "server-only";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { TOKEN_TYPE } from "@/constants/token";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { enqueueMail, scheduleDrain } from "@/server/services/shared/mail-outbox";
import {
  findLiveUserToken,
  issueUserToken,
} from "@/server/services/shared/user-token";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { hitRateLimit } from "@/lib/redis/rate-limit";
import {
  auditDualWriteFailed,
  auditDualWriteRecovered,
  GameSyncError,
  restoreGameCredential,
  revokeEverything,
  validateNewPassword,
  withPasswordLock,
  writeGamePassword,
  writeSitePassword,
  type GameCredential,
  type PasswordChangeOutcome,
} from "./shared";

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

      let accountId: number;
      let previous: GameCredential;
      try {
        ({ accountId, previous } = await writeGamePassword(user.username, input.newPassword));
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

      try {
        await writeSitePassword(user.id, input.newPassword);
      } catch (err) {
        const reason = err instanceof Error ? err.message : "site_write_failed";
        try {
          await restoreGameCredential(accountId, previous);
          await prisma.userToken.update({ where: { id: row.id }, data: { usedAt: null } });
          await auditDualWriteFailed(user.id, `site_write_failed:${reason}`, input.ip);
          await auditDualWriteRecovered(user.id, "game_rollback_and_token_released", input.ip);
        } catch (rollbackErr) {
          const rollbackReason = rollbackErr instanceof Error ? rollbackErr.message : "unknown";
          await auditDualWriteFailed(user.id, `rollback_failed:${rollbackReason}`, input.ip);
        }
        return { ok: false as const, reason: "game_sync_failed" as const };
      }

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
