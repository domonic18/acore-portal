import "server-only";
import { PrismaClient as CharactersPrismaClient } from "@/generated/characters";

const globalStore = globalThis as unknown as { __charactersPrisma?: CharactersPrismaClient };

export const charactersDb: CharactersPrismaClient =
  globalStore.__charactersPrisma ?? new CharactersPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalStore.__charactersPrisma = charactersDb;
}
