import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { authDb } from "@/lib/db/auth";
import { env } from "@/lib/env";
import { gameShaPassHash } from "@/lib/auth/game-hash";
import { hashWpBcrypt } from "@/lib/auth/wp-bcrypt";
import { PASSWORD_ALGO, PENDING_HASH_PREFIX } from "@/constants/password";
import { TOKEN_TYPE } from "@/constants/token";
import { MAIL_TEMPLATE } from "@/constants/mail";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { REGISTER_REWARD_AMOUNT, POINT_TX_TYPE } from "@/constants/points";
import { writeAudit } from "@/server/services/audit";
import { enqueueMail, scheduleDrain, checkResendRate } from "@/server/services/mail-outbox";
import { creditLedger } from "@/server/services/ledger";
import { issueUserToken, findLiveUserToken } from "@/server/services/user-token";
import {
  withPasswordLock,
  validateNewPassword,
} from "@/server/services/auth/password";
import { createSession } from "@/lib/auth/session";
import { isUniqueViolation } from "@/server/http";

/**
 * US2 注册→激活链路:
 * 注册受理=站点事务(占位 user+奖励+2+activate token+outbox)→游戏端建号;
 * 游戏端失败→站点侧整体补偿删除,0 半成品(SC-004,跨库无原子性,补偿方向
 * 选站点因 writer 无 DELETE 无法回滚游戏端,而站点可完全回收)。
 * 激活(设密)=游戏端先写真哈希→站点落 $wp$ bcrypt+审计,失败则 token 释放可重试
 * (与 US3 密码双写同一顺序契约)。占位哈希前缀双不命中分派→激活前不可登录。
 */

export function isValidUsername(username: string): boolean {
  // FR-003:2-32 位、禁 @
  return username.length >= 2 && username.length <= 32 && !username.includes("@");
}

function pendingHash(): string {
  return `${PENDING_HASH_PREFIX}${randomBytes(16).toString("hex")}`;
}

function isPlaceholder(passwordHash: string): boolean {
  return passwordHash.startsWith(PENDING_HASH_PREFIX);
}

export type RegisterOutcome =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "invalid_username"
        | "username_taken"
        | "email_taken"
        | "username_conflict"
        | "game_db_unavailable";
    };

/** 站点侧整体回收(注册失败补偿/占位过期回收):无外键残留 */
async function purgeSiteUser(userId: bigint): Promise<void> {
  await prisma.$transaction([
    prisma.userToken.deleteMany({ where: { userId } }),
    prisma.pointTransaction.deleteMany({ where: { userId } }),
    prisma.pointAccount.deleteMany({ where: { userId } }),
    prisma.mailOutbox.deleteMany({ where: { relatedUserId: userId } }),
    prisma.user.delete({ where: { id: userId } }),
  ]);
}

/** 占位且激活 token 已全部过期/不存在 → 可回收;有 live token 视为占用(还能激活) */
async function recycleIfExpiredPlaceholder(user: {
  id: bigint;
  passwordHash: string;
}): Promise<boolean> {
  if (!isPlaceholder(user.passwordHash)) return false;
  const live = await prisma.userToken.findFirst({
    where: {
      userId: user.id,
      type: TOKEN_TYPE.ACTIVATE,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  if (live) return false;
  await purgeSiteUser(user.id);
  return true;
}

export async function registerAccount(
  input: { username: string; email: string },
  ctx: { ip?: string | null } = {},
): Promise<RegisterOutcome> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  if (!isValidUsername(username)) return { ok: false, reason: "invalid_username" };

  // 两侧占用(FR-004);占位+token 过期 → 回收后视为可用
  const byUsername = await prisma.user.findUnique({ where: { username } });
  if (byUsername && !(await recycleIfExpiredPlaceholder(byUsername))) {
    return { ok: false, reason: "username_taken" };
  }
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail && !(await recycleIfExpiredPlaceholder(byEmail))) {
    return { ok: false, reason: "email_taken" };
  }
  if (await authDb.findByUsername(username)) {
    return { ok: false, reason: "username_taken" };
  }

  let userId: bigint;
  try {
    // 站点事务:占位 user + 奖励 +2 + activate token + outbox 同事务原子
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username,
          email,
          passwordHash: pendingHash(),
          passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
        },
        select: { id: true },
      });
      await creditLedger(tx, {
        userId: user.id,
        amount: REGISTER_REWARD_AMOUNT,
        type: POINT_TX_TYPE.REGISTER_REWARD,
        remark: "注册奖励",
      });
      const token = await issueUserToken(tx, {
        userId: user.id,
        type: TOKEN_TYPE.ACTIVATE,
      });
      await enqueueMail(tx, {
        to: email,
        template: MAIL_TEMPLATE.ACTIVATE,
        payload: {
          username,
          link: `${env.APP_URL}/register/set-password?token=${token.plain}`,
        },
        relatedUserId: user.id,
      });
      return { userId: user.id };
    });
    userId = created.userId;
  } catch (err) {
    // 并发撞号唯一索引兜底(FR-009)
    if (isUniqueViolation(err)) {
      return { ok: false, reason: "username_conflict" };
    }
    throw err;
  }

  try {
    // 游戏端建号:占位随机哈希(格式合法但无人知晓),激活时写真哈希
    await authDb.createAccount({
      username,
      email,
      shaPassHash: gameShaPassHash(username, randomBytes(32).toString("hex")),
    });
  } catch (err) {
    // 跨库失败→站点侧整体补偿,0 半成品(SC-004)
    await purgeSiteUser(userId);
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.ACCOUNT_DUAL_WRITE_FAILED,
      payload: { stage: "register", duplicate: isUniqueViolation(err) },
      ip: ctx.ip,
    });
    return {
      ok: false,
      reason: isUniqueViolation(err) ? "username_conflict" : "game_db_unavailable",
    };
  }

  scheduleDrain();
  return { ok: true };
}

export type ActivateOutcome =
  | { ok: true; accessToken: string; role: string }
  | {
      ok: false;
      reason: "invalid_token" | "weak_password" | "game_db_unavailable";
      message?: string;
    };

/** 激活=设密最后一环:游戏端先写真哈希→站点落 $wp$+审计;激活即登录 */
export async function activateAccount(input: {
  tokenPlain: string;
  password: string;
  ip?: string | null;
}): Promise<ActivateOutcome> {
  const row = await findLiveUserToken(prisma, {
    type: TOKEN_TYPE.ACTIVATE,
    plain: input.tokenPlain,
  });
  if (!row) return { ok: false, reason: "invalid_token" };

  const user = await prisma.user.findUnique({
    where: { id: row.userId },
    select: { id: true, username: true, role: true },
  });
  if (!user) return { ok: false, reason: "invalid_token" };

  const policy = validateNewPassword(input.password, user.username);
  if (!policy.ok) {
    return { ok: false, reason: "weak_password", message: policy.message };
  }

  return withPasswordLock<ActivateOutcome>(
    user.id,
    async () => {
      // 先占 token(并发双消费仅一方成功),游戏端失败则释放回可重试
      const claimed = await prisma.userToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (claimed.count === 0) return { ok: false, reason: "invalid_token" };

      try {
        const account = await authDb.findByUsername(user.username);
        if (!account) throw new Error("game_account_missing");
        await authDb.updateAccountCredential(account.id, {
          shaPassHash: gameShaPassHash(user.username, input.password),
        });
      } catch {
        await prisma.userToken.update({
          where: { id: row.id },
          data: { usedAt: null },
        });
        await writeAudit({
          category: AUDIT_CATEGORY.SECURITY,
          action: AUDIT_ACTION.ACCOUNT_DUAL_WRITE_FAILED,
          actorUserId: user.id,
          payload: { stage: "activate" },
          ip: input.ip,
        });
        return { ok: false, reason: "game_db_unavailable" };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashWpBcrypt(input.password),
          passwordAlgo: PASSWORD_ALGO.BCRYPT_WP,
        },
      });
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.ACCOUNT_ACTIVATED,
        actorUserId: user.id,
        payload: { result: "ok" },
        ip: input.ip,
      });
      const { accessToken } = await createSession(user.id, user.role);
      return { ok: true, accessToken, role: user.role };
    },
    () => ({ ok: false, reason: "invalid_token" }),
  );
}

export type ResendOutcome =
  | { known: true }
  | { known: false }
  | { known: true; throttled: true; retryAfterSec: number };

/** 激活邮件重发:仅占位账号可重发;对外不泄露邮箱存在性(路由恒定 202) */
export async function resendActivation(emailRaw: string): Promise<ResendOutcome> {
  const email = emailRaw.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, username: true, passwordHash: true },
  });
  if (!user || !isPlaceholder(user.passwordHash)) {
    return { known: false };
  }
  const gate = await checkResendRate(user.id.toString(), "activate");
  if (!gate.ok) {
    return { known: true, throttled: true, retryAfterSec: gate.retryAfterSec };
  }
  await prisma.$transaction(async (tx) => {
    const token = await issueUserToken(tx, {
      userId: user.id,
      type: TOKEN_TYPE.ACTIVATE,
    });
    await enqueueMail(tx, {
      to: email,
      template: MAIL_TEMPLATE.ACTIVATE,
      payload: {
        username: user.username,
        link: `${env.APP_URL}/register/set-password?token=${token.plain}`,
      },
      relatedUserId: user.id,
    });
  });
  scheduleDrain();
  return { known: true };
}
