import "server-only";
import { PrismaClient as ProbePrismaClient } from "@/generated/characters";

/**
 * 游戏库连通性探测:临时建一个 client 连一次 SELECT 1 再断开,
 * 不动进程内缓存的 client(那是运行期的活)。
 * 复用 characters 的生成客户端即可——raw 查询不触碰任何表。
 */
export async function probeGameDb(url: string): Promise<{ ok: boolean; message: string }> {
  let client: ProbePrismaClient | null = null;
  try {
    client = new ProbePrismaClient({ datasourceUrl: url });
    await client.$queryRaw`SELECT 1`;
    return { ok: true, message: "数据库连通" };
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err);
    return { ok: false, message: raw.split("\n")[0]?.slice(0, 200) || "连接失败" };
  } finally {
    await client?.$disconnect().catch(() => undefined);
  }
}
