import "server-only";
import { prisma } from "./business";
import { authDb } from "./auth";
import { getCharactersDb } from "./characters";
import { getWorldDb } from "./world";
import { getElunaDb } from "./eluna";
import { getConfig } from "@/lib/config";

export { prisma, authDb, getCharactersDb, getWorldDb, getElunaDb };

export type DbCheck = { name: string; ok: boolean; error?: string };

/** 业务库自检(必须在装载 system_config 之前:配置表就在业务库里) */
export async function checkBusinessDatabase(): Promise<DbCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "business", ok: true };
  } catch (err) {
    return { name: "business", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** 游戏四库自检(连接串来自 system_config,调用前配置必须已装载) */
export async function checkGameDatabases(): Promise<DbCheck[]> {
  await getConfig(); // 预热/断言配置;游戏库连接串由其提供
  const probes: Array<[string, () => Promise<unknown>]> = [
    // authDb 无裸查询暴露;findByUsername 探针即证明连接与 account 表可达
    ["auth", () => authDb.findByUsername("__healthcheck__")],
    ["characters", () => getCharactersDb().then((db) => db.$queryRaw`SELECT 1`)],
    ["world", () => getWorldDb().then((db) => db.$queryRaw`SELECT 1`)],
    ["eluna", () => getElunaDb().then((db) => db.$queryRaw`SELECT 1`)],
  ];

  return Promise.all(
    probes.map(async ([name, probe]) => {
      try {
        await probe();
        return { name, ok: true };
      } catch (err) {
        return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}
