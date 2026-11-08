import "server-only";
import { PrismaClient as ElunaPrismaClient } from "@/generated/eluna";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __elunaPrisma?: ElunaPrismaClient };

/**
 * 重置缓存的 client(后台改连接串后热生效,免重启):
 * 断开并丢弃缓存,下次调用按当前配置重建。
 */
export async function resetElunaDb(): Promise<void> {
  const client = globalStore.__elunaPrisma;
  globalStore.__elunaPrisma = undefined;
  if (client) await client.$disconnect().catch(() => undefined);
}

/** 连接串存 system_config(gamedb.eluna),首次调用建连并缓存 */
export async function getElunaDb(): Promise<ElunaPrismaClient> {
  if (!globalStore.__elunaPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__elunaPrisma = new ElunaPrismaClient({ datasourceUrl: gamedb.eluna });
  }
  return globalStore.__elunaPrisma;
}
