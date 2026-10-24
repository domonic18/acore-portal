import "server-only";
import { getCharactersDb } from "@/lib/db/characters";
import { authDb } from "@/lib/db/auth";

/** 游戏库不可达 → 503 GAME_DB_UNAVAILABLE(契约:页面骨架+重试提示,不白屏) */
export class GameDbError extends Error {}

/** 站点用户名 → 游戏账号 id(UPPER);未建号(理论不该发生)返回 null */
export async function resolveGameAccountId(username: string): Promise<number | null> {
  try {
    const account = await authDb.findByUsername(username);
    return account?.id ?? null;
  } catch (err) {
    console.error("[characters] resolve game account failed", err);
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
    console.error("[characters] list characters failed", err);
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
    console.error("[characters] ownership check failed", err);
    throw new GameDbError("角色库不可用");
  }
}

export type RestorableItem = {
  entry: number;
  name: string | null;
  quality: number | null;
  count: number;
};

/**
 * 只读恢复列表(recovery_item 表,旧站同源)。
 * M1 不连 world.item_template,名称留 null 由前端回退「物品 #entry」。
 */
export async function listRestorableItems(guid: number): Promise<RestorableItem[]> {
  try {
    const rows = await (await getCharactersDb()).recoveryItem.findMany({
      where: { guid },
      select: { itemEntry: true },
      orderBy: { id: "asc" },
    });
    return rows.map((r) => ({ entry: r.itemEntry, name: null, quality: null, count: 1 }));
  } catch (err) {
    console.error("[characters] restorable items failed", err);
    throw new GameDbError("角色库不可用");
  }
}
