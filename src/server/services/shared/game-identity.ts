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
 * 批量取「站点用户名 → 游戏角色名」映射(后台订单/用户列表展示用):
 * 一次 auth 查账号 + 一次 characters 查角色,避免逐行查库。
 * 键为大写用户名(AC 账号名约定),值按等级降序、同级 guid 升序。
 * 游戏库不可达 → GameDbError(调用方决定降级展示)。
 */
export async function listCharacterNamesByUsernames(
  usernames: string[],
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  const unique = [...new Set(usernames.filter((u) => u.trim() !== ""))];
  if (unique.length === 0) return result;

  let accounts: { id: number; username: string }[];
  try {
    accounts = await authDb.findIdsByUsernames(unique);
  } catch (err) {
    console.error("[game-identity] resolve game accounts failed", err);
    throw new GameDbError("游戏账号库不可用");
  }
  if (accounts.length === 0) return result;

  let rows: { account: number; name: string }[];
  try {
    rows = await (await getCharactersDb()).characters.findMany({
      where: { account: { in: accounts.map((a) => a.id) } },
      select: { account: true, name: true, level: true, guid: true },
      orderBy: [{ level: "desc" }, { guid: "asc" }],
    });
  } catch (err) {
    console.error("[game-identity] list character names failed", err);
    throw new GameDbError("角色库不可用");
  }

  const namesByAccount = new Map<number, string[]>();
  for (const r of rows) {
    const names = namesByAccount.get(r.account);
    if (names) names.push(r.name);
    else namesByAccount.set(r.account, [r.name]);
  }
  for (const a of accounts) {
    const names = namesByAccount.get(a.id);
    if (names && names.length > 0) result.set(a.username.toUpperCase(), names);
  }
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
