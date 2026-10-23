import "server-only";
import { PrismaClient as WorldPrismaClient } from "@/generated/world";

const globalStore = globalThis as unknown as { __worldPrisma?: WorldPrismaClient };

export const worldDb: WorldPrismaClient = globalStore.__worldPrisma ?? new WorldPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalStore.__worldPrisma = worldDb;
}
