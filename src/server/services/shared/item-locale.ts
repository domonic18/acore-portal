import "server-only";
import { getWorldDb } from "@/lib/db/world";

/**
 * 物品中文本地化查询(跨域基础,AGENTS 域服务禁互引):
 * 中文名取 world.item_template_locale 的 zhCN 行(issue #151);
 * 该表在精简游戏库可能不存在 → 一律降级为「无本地化数据」,不阻断业务、不报 503。
 */

/** 中文本地化语言标记(AC 真表 locale 取值) */
export const LOCALE_ZH_CN = "zhCN";

/** 表缺失(精简游戏库)时按「无本地化数据」处理,不算查询失败 */
export function isMissingLocaleTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "P2021") return true;
  const msg = `${e?.message ?? ""} ${String(err)}`;
  return /item_template_locale/i.test(msg) && /does not exist|doesn't exist|1146/i.test(msg);
}

/** 按 entry 批量取 zhCN 中文名;表缺失或出错 → 返回空映射(降级) */
export async function zhNamesByEntry(entries: number[]): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  if (entries.length === 0) return map;
  try {
    const db = await getWorldDb();
    const rows = await db.itemTemplateLocale.findMany({
      where: { locale: LOCALE_ZH_CN, id: { in: entries } },
      select: { id: true, name: true },
    });
    for (const r of rows) {
      if (r.name) map.set(r.id, r.name);
    }
  } catch (err) {
    if (!isMissingLocaleTable(err)) {
      console.error("[item-locale] item_template_locale lookup failed", err);
    }
  }
  return map;
}
