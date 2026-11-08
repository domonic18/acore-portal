import "server-only";
import { PrismaClient as CharactersPrismaClient } from "@/generated/characters";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __charactersPrisma?: CharactersPrismaClient };

/**
 * 重置缓存的 client(后台改连接串后热生效,免重启):
 * 断开并丢弃缓存,下次调用按当前配置重建。
 */
export async function resetCharactersDb(): Promise<void> {
  const client = globalStore.__charactersPrisma;
  globalStore.__charactersPrisma = undefined;
  if (client) await client.$disconnect().catch(() => undefined);
}

/** 连接串存 system_config(gamedb.characters),首次调用建连并缓存 */
export async function getCharactersDb(): Promise<CharactersPrismaClient> {
  if (!globalStore.__charactersPrisma) {
    const { gamedb } = await getConfig();
    globalStore.__charactersPrisma = new CharactersPrismaClient({
      datasourceUrl: gamedb.characters,
    });
  }
  return globalStore.__charactersPrisma;
}
