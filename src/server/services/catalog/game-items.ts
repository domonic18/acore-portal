import "server-only";
import { getWorldDb } from "@/lib/db/world";
import { GameDbError } from "@/server/services/shared/game-identity";

/**
 * 游戏物品检索(后台商品编辑页的物品选择器):
 * 数据源 world.item_template —— **只读子集,仅映射 entry/name/quality/stackable 四列**
 * (真实表列远多于此,故 Prisma 不多映射一列;stackable 已与 AC 真表核对:
 * `stackable int default 1`,1=不可堆叠,>1=可堆叠)。
 * 中文名另取 world.item_template_locale 的 zhCN 行(issue #151);
 * 该表在精简游戏库可能不存在 → 降级为只显示英文名,不阻断检索。
 */

export type GameItemHit = {
  entry: number;
  /** 英文名(item_template.name) */
  name: string | null;
  /** 中文名(item_template_locale zhCN);无本地化行或表缺失时为 null */
  nameZh: string | null;
  quality: number | null;
  /** 最大堆叠数(1=不可堆叠;>1 ⇒ SKU 须带 _stack,一封邮件发多个) */
  stackable: number | null;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
/** 中文名检索的候选上限:避免一次模糊匹配把整张本地化表拉进内存 */
const LOCALE_CANDIDATE_CAP = 200;
/** 中文本地化语言标记(AC 真表 locale 取值) */
const LOCALE_ZH_CN = "zhCN";

type ItemRow = {
  entry: number;
  name: string | null;
  quality: number | null;
  stackable: number | null;
};

/** 表缺失(精简游戏库)时按「无本地化数据」处理,不算检索失败 */
function isMissingLocaleTable(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "P2021") return true;
  const msg = `${e?.message ?? ""} ${String(err)}`;
  return /item_template_locale/i.test(msg) && /does not exist|doesn't exist|1146/i.test(msg);
}

/** 按 entry 批量取 zhCN 中文名;表缺失或出错 → 返回空映射(降级) */
async function zhNamesByEntry(entries: number[]): Promise<Map<number, string>> {
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
      console.error("[game-items] item_template_locale lookup failed", err);
    }
  }
  return map;
}

/** 中文名模糊匹配出的 entry 候选;表缺失 → 空数组 */
async function zhCandidateEntries(q: string, cap: number): Promise<number[]> {
  try {
    const db = await getWorldDb();
    const rows = await db.itemTemplateLocale.findMany({
      where: { locale: LOCALE_ZH_CN, name: { contains: q } },
      select: { id: true },
      take: cap,
    });
    return rows.map((r) => r.id);
  } catch (err) {
    if (!isMissingLocaleTable(err)) {
      console.error("[game-items] item_template_locale search failed", err);
    }
    return [];
  }
}

/** 检索物品:纯数字按 entry 精确命中,其余按英文名或中文名包含匹配 */
export async function searchGameItems(params: {
  q?: string;
  limit?: number;
}): Promise<GameItemHit[]> {
  const q = (params.q ?? "").trim();
  const raw = params.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  try {
    const db = await getWorldDb();
    let rows: ItemRow[];
    if (q === "") {
      rows = await db.itemTemplate.findMany({
        select: { entry: true, name: true, quality: true, stackable: true },
        take: limit,
        orderBy: [{ quality: "desc" }, { entry: "asc" }],
      });
    } else if (/^\d+$/.test(q)) {
      rows = await db.itemTemplate.findMany({
        where: { entry: Number(q) },
        select: { entry: true, name: true, quality: true, stackable: true },
        take: limit,
      });
    } else {
      // 英文名 或 中文名 任一命中
      const zhEntries = await zhCandidateEntries(q, LOCALE_CANDIDATE_CAP);
      rows = await db.itemTemplate.findMany({
        where:
          zhEntries.length > 0
            ? { OR: [{ name: { contains: q } }, { entry: { in: zhEntries } }] }
            : { name: { contains: q } },
        select: { entry: true, name: true, quality: true, stackable: true },
        take: limit,
        orderBy: [{ quality: "desc" }, { entry: "asc" }],
      });
    }
    const zhNames = await zhNamesByEntry(rows.map((r) => r.entry));
    return rows.map((r) => ({
      entry: r.entry,
      name: r.name,
      nameZh: zhNames.get(r.entry) ?? null,
      quality: r.quality,
      stackable: r.stackable,
    }));
  } catch (err) {
    console.error("[game-items] item_template search failed", err);
    throw new GameDbError("物品模板库不可用");
  }
}

/** 单个物品查询(按 entry 精确);查不到返回 null */
export async function getGameItem(entry: number): Promise<GameItemHit | null> {
  try {
    const db = await getWorldDb();
    const row = await db.itemTemplate.findUnique({
      where: { entry },
      select: { entry: true, name: true, quality: true, stackable: true },
    });
    if (!row) return null;
    const zhNames = await zhNamesByEntry([entry]);
    return { ...row, nameZh: zhNames.get(entry) ?? null };
  } catch (err) {
    console.error("[game-items] item_template lookup failed", err);
    throw new GameDbError("物品模板库不可用");
  }
}
