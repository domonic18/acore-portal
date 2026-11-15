import "server-only";
import { getCharactersDb } from "@/lib/db/characters";
import { getWorldDb } from "@/lib/db/world";
import { authDb } from "@/lib/db/auth";
import { zhNamesByEntry } from "@/server/services/shared/item-locale";

/**
 * 游戏库只读基础层(跨域基础,AGENTS 域服务禁互引):
 * 账号定位/归属校验/角色名册/恢复列表,auth 与 shop 等域共同消费。
 * 游戏库不可达 → GameDbError 由视图/路由转 503(不白屏)。
 */
export class GameDbError extends Error {}

/** 站点用户名 → 游戏账号 id(UPPER);未建号(理论不该发生)返回 null */
export async function resolveGameAccountId(username: string): Promise<number | null> {
  try {
    const account = await authDb.findByUsername(username);
    return account?.id ?? null;
  } catch (err) {
    console.error("[game-identity] resolve game account failed", err);
    throw new GameDbError("游戏账号库不可用");
  }
}

export type OwnCharacter = {
  guid: number;
  name: string;
  race: number;
  class: number;
  gender: number;
  level: number;
  online: boolean;
};

/** 只读投影:account=本人 服务端强制过滤(FR-017,越权 0 成功) */
export async function listOwnCharacters(accountId: number): Promise<OwnCharacter[]> {
  try {
    const rows = await (await getCharactersDb()).characters.findMany({
      where: { account: accountId },
      select: {
        guid: true,
        name: true,
        race: true,
        class: true,
        gender: true,
        level: true,
        online: true,
      },
      orderBy: [{ level: "desc" }, { guid: "asc" }],
    });
    return rows.map((r) => ({
      guid: r.guid,
      name: r.name,
      race: r.race,
      class: r.class,
      gender: r.gender,
      level: r.level,
      online: r.online !== 0,
    }));
  } catch (err) {
    console.error("[game-identity] list characters failed", err);
    throw new GameDbError("角色库不可用");
  }
}

/** 归属校验(FR-017):guid 必须属于该游戏账号名下 */
export async function characterOwnedBy(accountId: number, guid: number): Promise<boolean> {
  try {
    const hit = await (await getCharactersDb()).characters.findFirst({
      where: { guid, account: accountId },
      select: { guid: true },
    });
    return hit !== null;
  } catch (err) {
    console.error("[game-identity] ownership check failed", err);
    throw new GameDbError("角色库不可用");
  }
}

/**
 * 批量取「角色 guid → 角色名」映射(后台订单列表按单展示目标角色用):
 * 一次 characters 查表,避免逐行查库。
 * 键是角色 guid(订单行 params 落定的目标角色),**不是**账号 ⇒
 * 「本单买给了哪个角色」与「账号名下有哪些角色」是两回事,后者会列出无关角色。
 * 角色已删除 ⇒ 该 guid 不在结果里,调用方自行降级展示。
 * 游戏库不可达 → GameDbError(调用方决定降级展示)。
 */
export async function listCharacterNamesByGuids(
  guids: number[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const unique = [...new Set(guids.filter((g) => Number.isInteger(g) && g > 0))];
  if (unique.length === 0) return result;

  let rows: { guid: number; name: string }[];
  try {
    rows = await (await getCharactersDb()).characters.findMany({
      where: { guid: { in: unique } },
      select: { guid: true, name: true },
    });
  } catch (err) {
    console.error("[game-identity] list character names by guids failed", err);
    throw new GameDbError("角色库不可用");
  }

  for (const r of rows) result.set(r.guid, r.name);
  return result;
}

export type RestorableItem = {
  entry: number;
  name: string | null;
  /** 中文名(item_template_locale zhCN,issue #174);无本地化行或表缺失时为 null */
  nameZh: string | null;
  quality: number | null;
  count: number;
  /** world.item_template 命中;数据缺失的行不可恢复(T041 M2 语义) */
  restorable: boolean;
};

/**
 * 只读恢复列表(recovery_item 表,旧站同源)。
 * M2 起 join world.item_template 补名称/质量色并给 restorable 标记
 * (模板缺失行可展示但不可恢复);中文名经 item-locale 回填,表缺失降级为 null。
 * world 不可达与角色库同视为 GameDbError。
 */
export async function listRestorableItems(guid: number): Promise<RestorableItem[]> {
  try {
    const rows = await (await getCharactersDb()).recoveryItem.findMany({
      where: { guid },
      select: { itemEntry: true },
      orderBy: { id: "asc" },
    });
    if (rows.length === 0) return [];
    const entries = [...new Set(rows.map((r) => r.itemEntry))];
    const [templates, zhNames] = await Promise.all([
      (await getWorldDb()).itemTemplate.findMany({
        where: { entry: { in: entries } },
        select: { entry: true, name: true, quality: true },
      }),
      zhNamesByEntry(entries),
    ]);
    const byEntry = new Map(templates.map((t) => [t.entry, t]));
    return rows.map((r) => {
      const t = byEntry.get(r.itemEntry);
      return {
        entry: r.itemEntry,
        name: t?.name ?? null,
        nameZh: zhNames.get(r.itemEntry) ?? null,
        quality: t?.quality ?? null,
        count: 1,
        restorable: t !== undefined,
      };
    });
  } catch (err) {
    console.error("[game-identity] restorable items failed", err);
    throw new GameDbError("游戏数据暂不可用");
  }
}
