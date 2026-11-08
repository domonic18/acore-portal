import "server-only";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/db";
import { ADMIN_INVITATION_PAGE_SIZE } from "@/constants/pagination";
import {
  INVITATION_ALPHABET,
  INVITATION_LIMITS,
  INVITATION_PREFIX_PATTERN,
} from "@/constants/invitation";
import { pageSlice, totalPageCount } from "@/lib/pagination";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/shared/audit";
import { UsersAdminError } from "./shared";

// ===== 邀请码(M1 表与状态机复用) =====

export const INVITATION_COUNT_MAX = INVITATION_LIMITS.COUNT_MAX;

export type InvitationListItem = {
  id: string;
  code: string;
  status: string;
  maxUses: number;
  usedCount: number;
  expiresAt: string | null;
  expired: boolean;
  usedBy: string[];
  createdAt: string;
};

export async function listInvitationCodes(opts: { page?: number }): Promise<{
  items: InvitationListItem[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const { skip, take } = pageSlice(page, ADMIN_INVITATION_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.invitationCode.count(),
    prisma.invitationCode.findMany({
      orderBy: { id: "desc" },
      skip,
      take,
      include: { uses: { include: { user: { select: { username: true } } } } },
    }),
  ]);
  const now = Date.now();
  return {
    page,
    totalPages: totalPageCount(total, ADMIN_INVITATION_PAGE_SIZE),
    total,
    items: rows.map((c) => ({
      id: c.id.toString(),
      code: c.code,
      status: c.status,
      maxUses: c.maxUses,
      usedCount: c.usedCount,
      expiresAt: c.expiresAt?.toISOString() ?? null,
      expired: c.expiresAt !== null && c.expiresAt.getTime() < now,
      usedBy: c.uses.map((u) => u.user.username),
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function generateInvitationCodes(input: {
  prefix: string;
  length: number;
  count: number;
  maxUses: number;
  expiresAt?: Date | null;
  operatorId: bigint;
  ip?: string | null;
}): Promise<string[]> {
  if (input.count < INVITATION_LIMITS.COUNT_MIN || input.count > INVITATION_LIMITS.COUNT_MAX) {
    throw new UsersAdminError(
      "PARAM_INVALID",
      `单次生成数量须在 ${INVITATION_LIMITS.COUNT_MIN}-${INVITATION_LIMITS.COUNT_MAX} 之间。`,
    );
  }
  if (
    input.maxUses < INVITATION_LIMITS.MAX_USES_MIN ||
    input.maxUses > INVITATION_LIMITS.MAX_USES_MAX
  ) {
    throw new UsersAdminError(
      "PARAM_INVALID",
      `每码可用次数须在 ${INVITATION_LIMITS.MAX_USES_MIN}-${INVITATION_LIMITS.MAX_USES_MAX} 之间。`,
    );
  }
  if (
    input.prefix.length < INVITATION_LIMITS.PREFIX_MIN ||
    input.prefix.length > INVITATION_LIMITS.PREFIX_MAX ||
    !INVITATION_PREFIX_PATTERN.test(input.prefix)
  ) {
    throw new UsersAdminError(
      "PARAM_INVALID",
      `前缀须为 ${INVITATION_LIMITS.PREFIX_MIN}-${INVITATION_LIMITS.PREFIX_MAX} 位大写字母/数字。`,
    );
  }
  const bodyLen = input.length - input.prefix.length - 1;
  if (
    input.length < INVITATION_LIMITS.LENGTH_MIN ||
    input.length > INVITATION_LIMITS.LENGTH_MAX ||
    bodyLen < INVITATION_LIMITS.RANDOM_BODY_MIN
  ) {
    throw new UsersAdminError(
      "PARAM_INVALID",
      `总长度须为 ${INVITATION_LIMITS.LENGTH_MIN}-${INVITATION_LIMITS.LENGTH_MAX},且随机段不少于 ${INVITATION_LIMITS.RANDOM_BODY_MIN} 位。`,
    );
  }

  const codes: string[] = [];
  for (let i = 0; i < input.count; i += 1) {
    let body = "";
    for (let j = 0; j < bodyLen; j += 1) {
      body += INVITATION_ALPHABET[randomInt(INVITATION_ALPHABET.length)];
    }
    codes.push(`${input.prefix}-${body}`);
  }
  await prisma.invitationCode.createMany({
    data: codes.map((code) => ({
      code,
      prefix: input.prefix,
      length: input.length,
      maxUses: input.maxUses,
      expiresAt: input.expiresAt ?? null,
      createdBy: input.operatorId,
    })),
  });
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.INVITATION_GENERATED,
    actorUserId: input.operatorId,
    payload: { count: input.count, prefix: input.prefix, length: input.length, maxUses: input.maxUses },
    ip: input.ip,
  });
  return codes;
}

export async function setInvitationCodeStatus(
  id: bigint,
  status: "available" | "disabled",
  operatorId: bigint,
  ip?: string | null,
): Promise<void> {
  const hit = await prisma.invitationCode.updateMany({ where: { id }, data: { status } });
  if (hit.count === 0) throw new UsersAdminError("NOT_FOUND", "邀请码不存在。");
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.INVITATION_DISABLED,
    actorUserId: operatorId,
    payload: { invitationCodeId: id.toString(), status },
    ip,
  });
}
