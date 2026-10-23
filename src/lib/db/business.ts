import "server-only";
import { PrismaClient as BusinessPrismaClient } from "@/generated/business";

const globalStore = globalThis as unknown as { __businessPrisma?: BusinessPrismaClient };

export const prisma: BusinessPrismaClient =
  globalStore.__businessPrisma ?? new BusinessPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalStore.__businessPrisma = prisma;
}
