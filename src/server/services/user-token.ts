import "server-only";
import crypto from "node:crypto";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { sha256Hex } from "@/lib/auth/game-hash";
import { TOKEN_TTL_SECONDS, TOKEN_TYPE } from "@/constants/token";
import type { TokenTypeValue } from "@/constants/token";

/**
 * user_token 服务(research R11):
 * - 明文 token 只出现在邮件链接,库中仅存 SHA-256
 * - 一次性(used_at);同 user+type 再签发作废旧 token
 * - 有效期 activate 24h / password_reset 30min / email_change 24h
 * - 接受 PrismaClient 或事务客户端,便于与业务同事务原子提交
 */
type Db = Prisma.TransactionClient | typeof prisma;

export type IssuedToken = { plain: string; expiresAt: Date };

export async function issueUserToken(
  db: Db,
  input: { userId: bigint; type: TokenTypeValue; payload?: string },
): Promise<IssuedToken> {
  // 再签作废:同 user+type 旧 token 全部删除(R11)
  await db.userToken.deleteMany({
    where: { userId: input.userId, type: input.type },
  });
  const plain = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS[input.type] * 1000);
  await db.userToken.create({
    data: {
      userId: input.userId,
      type: input.type,
      tokenHash: sha256Hex(plain),
      payload: input.payload ?? null,
      expiresAt,
    },
  });
  return { plain, expiresAt };
}

export type ConsumedToken = { userId: bigint; payload: string | null };

/**
 * 消费 token:哈希命中 + 未用 + 未过期 → 原子标记 used_at。
 * 并发双消费仅一方成功(updateMany 条件含 used_at IS NULL)。
 */
export async function consumeUserToken(
  db: Db,
  input: { type: TokenTypeValue; plain: string },
): Promise<ConsumedToken | null> {
  const row = await db.userToken.findFirst({
    where: { tokenHash: sha256Hex(input.plain) },
  });
  if (!row || row.type !== input.type) return null;
  if (row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;

  const claimed = await db.userToken.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return null;
  return { userId: row.userId, payload: row.payload };
}

/** 仅查询不消费(重置流程需先取用户再做游戏端写入) */
export async function findLiveUserToken(
  db: Db,
  input: { type: TokenTypeValue; plain: string },
) {
  const row = await db.userToken.findFirst({
    where: { tokenHash: sha256Hex(input.plain) },
  });
  if (!row || row.type !== input.type) return null;
  if (row.usedAt || row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

export { TOKEN_TYPE };
