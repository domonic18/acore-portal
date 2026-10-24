import "server-only";
import { prisma } from "@/lib/db";
import { verifyPhpass } from "@/lib/auth/phpass";
import { hashWpBcrypt, verifyWpBcrypt } from "@/lib/auth/wp-bcrypt";
import {
  PASSWORD_ALGO,
  PHPASS_PREFIX,
  WP_BCRYPT_PREFIX,
} from "@/constants/password";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";

export type LoginUser = {
  id: bigint;
  username: string;
  email: string;
  role: "user" | "admin";
};

export type LoginOutcome =
  | { ok: true; user: LoginUser; upgraded: boolean }
  | { ok: false; failReason: "bad_password" | "banned" | "corrupt_hash" };

/** 按哈希前缀分派校验(research R2:前缀是自描述权威,upgrade 判定不看 cost) */
function verifyByHashPrefix(
  storedHash: string,
  password: string,
): boolean | null {
  if (storedHash.startsWith(WP_BCRYPT_PREFIX)) {
    return verifyWpBcrypt(password, storedHash);
  }
  if (storedHash.startsWith(PHPASS_PREFIX)) {
    return verifyPhpass(password, storedHash);
  }
  return null; // 未知格式
}

/**
 * US1 登录核心:存量用户原用户名+原密码直接登录。
 * - `$P$` 通过 → 立即重哈希 $wp$ cost 12(一人一次,用户零感知;纯站点侧,不碰游戏端)
 * - `$wp$` 通过 → 哈希零接触(2,658 存量承诺)
 * - 竞态防护(风险清单#4):校验失败且为 phpass 时,重读哈希再试一次
 *   (并发下另一请求可能已完成透明升级)
 */
export async function loginWithPassword(
  username: string,
  password: string,
  ctx: { ip?: string | null } = {},
): Promise<LoginOutcome> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      status: true,
      passwordHash: true,
    },
  });

  if (!user) return { ok: false, failReason: "bad_password" };
  if (user.status === "banned") {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_FAILED,
      actorUserId: user.id,
      payload: { reason: "banned" },
      ip: ctx.ip,
    });
    return { ok: false, failReason: "banned" };
  }

  let storedHash = user.passwordHash;
  let verified = verifyByHashPrefix(storedHash, password);

  if (verified === null) {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_FAILED,
      actorUserId: user.id,
      payload: { reason: "corrupt_hash" },
      ip: ctx.ip,
    });
    return { ok: false, failReason: "corrupt_hash" };
  }

  if (!verified && storedHash.startsWith(PHPASS_PREFIX)) {
    // 并发透明升级竞态:另一请求可能已升级哈希 → 重读再试
    const fresh = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (fresh && fresh.passwordHash !== storedHash) {
      storedHash = fresh.passwordHash;
      verified = verifyByHashPrefix(storedHash, password);
    }
  }

  if (!verified) {
    await writeAudit({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_FAILED,
      actorUserId: user.id,
      payload: { reason: "bad_password" },
      ip: ctx.ip,
    });
    return { ok: false, failReason: "bad_password" };
  }

  // 透明升级(仅 $P$):乐观锁 WHERE 旧哈希,并发下仅一方生效,其余方自然跳过
  let upgraded = false;
  if (storedHash.startsWith(PHPASS_PREFIX)) {
    const newHash = hashWpBcrypt(password);
    const result = await prisma.user.updateMany({
      where: { id: user.id, passwordHash: storedHash },
      data: { passwordHash: newHash, passwordAlgo: PASSWORD_ALGO.BCRYPT_WP },
    });
    upgraded = result.count === 1;
    if (upgraded) {
      await writeAudit({
        category: AUDIT_CATEGORY.SECURITY,
        action: AUDIT_ACTION.HASH_UPGRADED,
        actorUserId: user.id,
        payload: { algo: PASSWORD_ALGO.BCRYPT_WP },
        ip: ctx.ip,
      });
    }
  }

  return {
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
    upgraded,
  };
}
