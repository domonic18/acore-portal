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

export async function getAdminUserDetail(id: bigint) {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      pointAccount: { select: { balance: true } },
      badgeGrantsReceived: { include: { badge: true, pointTransaction: true } },
    },
  });
  if (!user) return null;
  const transactions = await prisma.pointTransaction.findMany({
    where: { userId: id },
    orderBy: { id: "desc" },
    take: 10,
  });
  return { ...user, recentTransactions: transactions };
}
