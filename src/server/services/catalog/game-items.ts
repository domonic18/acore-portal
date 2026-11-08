import "server-only";
import { getWorldDb } from "@/lib/db/world";
import { GameDbError } from "@/server/services/shared/game-identity";

/**
 * 游戏物品检索(后台商品编辑页的物品选择器):
 * 数据源 world.item_template —— **只读子集,仅映射 entry/name/quality/stackable 四列**
 * (真实表列远多于此,故 Prisma 不多映射一列;stackable 已与 AC 真表核对:
 * `stackable int default 1`,1=不可堆叠,>1=可堆叠)。
 * 因此选择器只能按 物品ID / 名称 / 品质 检索,没有图标、没有需求等级。
 */

export type GameItemHit = {
  entry: number;
  name: string | null;
  quality: number | null;
  /** 最大堆叠数(1=不可堆叠;>1 ⇒ SKU 须带 _stack,一封邮件发多个) */
  stackable: number | null;
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/** 检索物品:纯数字按 entry 精确命中,其余按名称包含匹配(MySQL 默认排序规则大小写不敏感) */
export async function searchGameItems(params: {
  q?: string;
  limit?: number;
}): Promise<GameItemHit[]> {
  const q = (params.q ?? "").trim();
  const raw = params.limit ?? DEFAULT_LIMIT;
  const limit = Math.min(Math.max(Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_LIMIT, 1), MAX_LIMIT);
  try {
    const db = await getWorldDb();
    return await db.itemTemplate.findMany({
      where: q === "" ? undefined : /^\d+$/.test(q) ? { entry: Number(q) } : { name: { contains: q } },
      select: { entry: true, name: true, quality: true, stackable: true },
      take: limit,
      orderBy: [{ quality: "desc" }, { entry: "asc" }],
    });
  } catch (err) {
    console.error("[game-items] item_template search failed", err);
    throw new GameDbError("物品模板库不可用");
  }
}

/** 单个物品查询(按 entry 精确);查不到返回 null */
export async function getGameItem(entry: number): Promise<GameItemHit | null> {
  try {
    const db = await getWorldDb();
    return await db.itemTemplate.findUnique({
      where: { entry },
      select: { entry: true, name: true, quality: true, stackable: true },
    });
  } catch (err) {
    console.error("[game-items] item_template lookup failed", err);
    throw new GameDbError("物品模板库不可用");
  }
}
