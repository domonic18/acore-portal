import "server-only";
import { PrismaClient as WorldPrismaClient } from "@/generated/world";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __worldPrisma?: WorldPrismaClient };

/** 连接串存 system_config(gamedb.world),首次调用建连并缓存 */
export async function getWorldDb(): Promise<WorldPrismaClient> {
  if (!globalStore.__worldPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__worldPrisma = new WorldPrismaClient({ datasourceUrl: gamedb.world });
  }
  return globalStore.__worldPrisma;
}
