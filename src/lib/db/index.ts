import "server-only";
import { prisma } from "./business";
import { authDb } from "./auth";
import { getCharactersDb } from "./characters";
import { getWorldDb } from "./world";
import { getElunaDb } from "./eluna";
import { getConfig } from "@/lib/config";

export { prisma, authDb, getCharactersDb, getWorldDb, getElunaDb };

export type DbCheck = {
  name: string;
  ok: boolean;
  error?: string;
  /** 该库未配置(可选依赖)而被跳过:ok=true,但不算「已自检通过」 */
  skipped?: boolean;
};

/** 业务库自检(必须在装载 system_config 之前:配置表就在业务库里) */
export async function checkBusinessDatabase(): Promise<DbCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "business", ok: true };
  } catch (err) {
    return { name: "business", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 游戏四库自检(连接串来自 system_config,调用前配置必须已装载)。
 *
 * 探针返回 "skipped" = 该库未配置(可选依赖,eluna)⇒ 不算失败;
 * 抛错 = 配了却连不上 ⇒ 算失败(启动 fail-fast)。两种语义必须分开:
 * 把「没配」当成「连不上」会让可选依赖缺失拖垮整个门户。
 */
export async function checkGameDatabases(): Promise<DbCheck[]> {
  await getConfig(); // 预热/断言配置;游戏库连接串由其提供
  const probes: Array<[string, () => Promise<"ok" | "skipped">]> = [
    // authDb 无裸查询暴露;findByUsername 探针即证明连接与 account 表可达
    ["auth", async () => {
      await authDb.findByUsername("__healthcheck__");
      return "ok";
    }],
    ["characters", async () => {
      await getCharactersDb().then((db) => db.$queryRaw`SELECT 1`);
      return "ok";
    }],
    ["world", async () => {
      await getWorldDb().then((db) => db.$queryRaw`SELECT 1`);
      return "ok";
    }],
    // eluna 可选依赖:未配置时跳过(不阻断启动),配了才探
    ["eluna", async () => {
      const db = await getElunaDb();
      if (!db) return "skipped";
      await db.$queryRaw`SELECT 1`;
      return "ok";
    }],
  ];

  return Promise.all(
    probes.map(async ([name, probe]) => {
      try {
        const result = await probe();
        return result === "skipped"
          ? { name, ok: true, skipped: true }
          : { name, ok: true };
      } catch (err) {
        return { name, ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
}
