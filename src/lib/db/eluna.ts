import "server-only";
import { PrismaClient as ElunaPrismaClient } from "@/generated/eluna";

const globalStore = globalThis as unknown as { __elunaPrisma?: ElunaPrismaClient };

export const elunaDb: ElunaPrismaClient = globalStore.__elunaPrisma ?? new ElunaPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalStore.__elunaPrisma = elunaDb;
}
