/**
 * 角色头图映射:WoW 客户端 CharacterCreate 官方种族头像(64×64,按性别),
 * 素材在 public/assets/icons/race/(2026-11-05 与我的角色页统一,移植自 acore-ranking)。
 * race 为 AzerothCore 数值枚举,1-8=60 时代可选种族,9-11=TBC 兜底。
 */

const RACE_SLUG: Record<number, string> = {
  1: "human",
  2: "orc",
  3: "dwarf",
  4: "nightelf",
  5: "undead",
  6: "tauren",
  7: "gnome",
  8: "troll",
  9: "goblin",
  10: "bloodelf",
  11: "draenei",
};

export const PORTRAIT_DEFAULT = "/portraits/default.svg";

/** race/gender → 官方种族头像站点路径;非法取值返回 null(调用方降级默认图) */
export function raceFacePath(race: number, gender: number): string | null {
  const slug = RACE_SLUG[race];
  if (!slug || (gender !== 0 && gender !== 1)) return null;
  return `/assets/icons/race/Ui-charactercreate-races_${slug}-${gender === 1 ? "female" : "male"}.png`;
}
