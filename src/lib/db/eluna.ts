import "server-only";
import { PrismaClient as ElunaPrismaClient } from "@/generated/eluna";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __elunaPrisma?: ElunaPrismaClient };

/** 连接串存 system_config(gamedb.eluna),首次调用建连并缓存 */
export async function getElunaDb(): Promise<ElunaPrismaClient> {
  if (!globalStore.__elunaPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__elunaPrisma = new ElunaPrismaClient({ datasourceUrl: gamedb.eluna });
  }
  return globalStore.__elunaPrisma;
}
