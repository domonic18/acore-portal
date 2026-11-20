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

/**
 * 连接串存 system_config(gamedb.eluna),首次调用建连并缓存。
 *
 * eluna 是**可选依赖**:未配置(键缺省/留空)时返回 null —— 调用方据此走
 * 「该库不存在」的降级路径,而不是拿 undefined 建 client 在构造处炸掉。
 * 「未配置」与「配了却连不上」是两种语义:后者由探针判失败。
 */
export async function getElunaDb(): Promise<ElunaPrismaClient | null> {
  const { gamedb } = await getConfig();
  if (!gamedb.eluna) return null;
  if (!globalStore.__elunaPrisma) {
    globalStore.__elunaPrisma = new ElunaPrismaClient({ datasourceUrl: gamedb.eluna });
  }
  return globalStore.__elunaPrisma;
}
