import "server-only";
import { prisma } from "./business";
import { authDb } from "./auth";
import { charactersDb } from "./characters";
import { worldDb } from "./world";
import { elunaDb } from "./eluna";

export { prisma, authDb, charactersDb, worldDb, elunaDb };

export type DbCheck = { name: string; ok: boolean; error?: string };

/** 五库连接自检(FR-022:启动时四库均可达;业务库必须可达) */
export async function checkDatabases(): Promise<DbCheck[]> {
  const probes: Array<[string, () => Promise<unknown>]> = [
    ["business", () => prisma.$queryRaw`SELECT 1`],
    // authDb 无裸查询暴露;findByUsername 探针即证明连接与 account 表可达
    ["auth", () => authDb.findByUsername("__healthcheck__")],
    ["characters", () => charactersDb.$queryRaw`SELECT 1`],
    ["world", () => worldDb.$queryRaw`SELECT 1`],
    ["eluna", () => elunaDb.$queryRaw`SELECT 1`],
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
