import "server-only";
import { PrismaClient as CharactersPrismaClient } from "@/generated/characters";
import { getConfig } from "@/lib/config";

const globalStore = globalThis as unknown as { __charactersPrisma?: CharactersPrismaClient };

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
