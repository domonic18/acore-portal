import "server-only";
import { PrismaClient as WorldPrismaClient } from "@/generated/world";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __worldPrisma?: WorldPrismaClient };

/**
 * 重置缓存的 client(后台改连接串后热生效,免重启):
 * 断开并丢弃缓存,下次调用按当前配置重建。
 */
export async function resetWorldDb(): Promise<void> {
  const client = globalStore.__worldPrisma;
  globalStore.__worldPrisma = undefined;
  if (client) await client.$disconnect().catch(() => undefined);
}

/** 连接串存 system_config(gamedb.world),首次调用建连并缓存 */
export async function getWorldDb(): Promise<WorldPrismaClient> {
  if (!globalStore.__worldPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__worldPrisma = new WorldPrismaClient({ datasourceUrl: gamedb.world });
  }
  return globalStore.__worldPrisma;
}
