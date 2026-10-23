/** 角色域常量(60 年代种族/职业枚举,clapic 序号=AC/WMaD 提取码) */

export const RACE_NAMES: Record<number, string> = {
  1: "人类",
  2: "兽人",
  3: "矮人",
  4: "暗夜精灵",
  5: "亡灵",
  6: "牛头人",
  7: "侏儒",
  8: "巨魔",
  9: "地精",
  10: "血精灵",
  11: "德莱尼",
};

export const CLASS_NAMES: Record<number, string> = {
  1: "战士",
  2: "圣骑士",
  3: "猎人",
  4: "盗贼",
  5: "牧师",
  6: "死亡骑士",
  7: "萨满祭司",
  8: "法师",
  9: "术士",
  11: "德鲁伊",
};

/** 职业主题色(WoW 官方职业色),头像底色映射 */
export const CLASS_COLORS: Record<number, string> = {
  1: "#C79C6E",
  2: "#F58CBA",
  3: "#ABD473",
  4: "#FFF569",
  5: "#FFFFFF",
  6: "#C41F3B",
  7: "#0070DE",
  8: "#69CCF0",
  9: "#9482C9",
  11: "#FF7D0A",
};

export function raceName(race: number): string {
  return RACE_NAMES[race] ?? `种族${race}`;
}

export function className(classId: number): string {
  return CLASS_NAMES[classId] ?? `职业${classId}`;
}

/** 头像:名字首字符 + 职业色底 */
export function characterAvatar(
  name: string,
  classId: number,
): { initial: string; color: string } {
  return { initial: name.slice(0, 1).toUpperCase(), color: CLASS_COLORS[classId] ?? "#6B7280" };
}
