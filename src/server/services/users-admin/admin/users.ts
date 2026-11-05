import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { ADMIN_USER_PAGE_SIZE } from "@/constants/pagination";
import { paginate } from "@/lib/pagination";

export async function listAdminUsers(opts: {
  query?: string;
  role?: string;
  page?: number;
}): Promise<{
  users: {
    id: string;
    username: string;
    nickname: string | null;
    email: string;
    role: string;
    status: string;
    balance: number | null;
    createdAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const q = opts.query?.trim();
  const where: Prisma.UserWhereInput = {};
  if (q) {
    where.OR = [
      { username: { contains: q } },
      { email: { contains: q } },
      { nickname: { contains: q } },
    ];
  }
  if (opts.role === "user" || opts.role === "moderator" || opts.role === "admin") {
    where.role = opts.role;
  }
  const total = await prisma.user.count({ where });
  const { totalPages, skip, take } = paginate(total, page, ADMIN_USER_PAGE_SIZE);
  const rows = await prisma.user.findMany({
    where,
    orderBy: { id: "desc" },
    skip,
    take,
    select: {
      id: true,
      username: true,
      nickname: true,
      email: true,
      role: true,
      status: true,
      createdAt: true,
      pointAccount: { select: { balance: true } },
    },
  });
  return {
    page,
    totalPages,
    total,
    users: rows.map((u) => ({
      id: u.id.toString(),
      username: u.username,
      nickname: u.nickname,
      email: u.email,
      role: u.role,
      status: u.status,
      balance: u.pointAccount?.balance ?? null,
      createdAt: u.createdAt.toISOString(),
    })),
  };
}

/** 用户详情页 DTO:BigInt/日期在 service 序列化,页面不做 ORM 适配(issue #78) */
export type AdminUserDetail = {
  id: string;
  username: string;
  nickname: string | null;
  email: string;
  role: string;
  status: string;
  wpUserId: number | null;
  createdAt: string;
  balance: number;
  badges: { id: string; name: string; level: number; grantedAt: string }[];
  recentTransactions: {
    id: string;
    type: string;
    amount: number;
    balanceAfter: number;
    remark: string | null;
    createdAt: string;
  }[];
};

export async function getAdminUserDetail(id: bigint): Promise<AdminUserDetail | null> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      pointAccount: { select: { balance: true } },
      badgeGrantsReceived: { orderBy: { createdAt: "asc" }, include: { badge: true } },
    },
  });
  if (!user) return null;
  const transactions = await prisma.pointTransaction.findMany({
    where: { userId: id },
    orderBy: { id: "desc" },
    take: 10,
  });
  return {
    id: user.id.toString(),
    username: user.username,
    nickname: user.nickname,
    email: user.email,
    role: user.role,
    status: user.status,
    wpUserId: user.wpUserId,
    createdAt: user.createdAt.toISOString(),
    balance: user.pointAccount?.balance ?? 0,
    badges: user.badgeGrantsReceived.map((g) => ({
      id: g.id.toString(),
      name: g.badge.name,
      level: g.badge.level,
      grantedAt: g.createdAt.toISOString(),
    })),
    recentTransactions: transactions.map((t) => ({
      id: t.id.toString(),
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      remark: t.remark,
      createdAt: t.createdAt.toISOString(),
    })),
  };
}
