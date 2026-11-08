import "server-only";
import { resetAuthDb } from "@/lib/db/auth";
import { resetCharactersDb } from "@/lib/db/characters";
import { resetElunaDb } from "@/lib/db/eluna";
import { resetWorldDb } from "@/lib/db/world";

/**
 * 游戏四库 client 全量重置(后台改 gamedb.* 连接串后调用):
 * 断开并丢弃进程内缓存,下次调用按新配置重建——换库免重启。
 * 放在 lib/db 下而非 settings 服务层:与 client 的持有者同层,避免二次导出。
 */
export async function resetGameDbClients(): Promise<void> {
  await Promise.all([resetAuthDb(), resetCharactersDb(), resetWorldDb(), resetElunaDb()]);
}
