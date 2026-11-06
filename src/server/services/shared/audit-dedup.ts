import "server-only";
import { setLockIfAbsent } from "@/lib/redis/rate-limit";
import { writeAudit, type AuditEntry } from "@/server/services/shared/audit";

/**
 * 去重审计写入(防写放大):同一 dedupKey 在 windowSec 内只落一行。
 * 攻击洪峰下计数照常推进,审计表不被刷屏;返回是否真的写了。
 * Redis 不可用时降级为直接写(宁可多写不可丢事件)。
 *
 * 与 shared/audit.ts 分文件:后者的去重依赖 Redis,不可从启动钩子链可达
 * (Next 14 为 instrumentation 额外编译 edge 产物,node-only 依赖会编译失败)。
 */
export async function writeAuditOnce(
  entry: AuditEntry,
  dedupKey: string,
  windowSec: number,
): Promise<boolean> {
  let acquired: boolean;
  try {
    acquired = await setLockIfAbsent(dedupKey, windowSec);
  } catch {
    acquired = true;
  }
  if (!acquired) return false;
  await writeAudit(entry);
  return true;
}
