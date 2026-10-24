/**
 * 随机角色头图映射(M3 US1,R10):60 级客户端 race/class 全组合枚举 →
 * public/portraits/ 静态头像集(占位 SVG,scripts/dev/gen-portraits.mjs 生成,可替换真素材)。
 * race/class 为 AzerothCore 数值枚举,race 1-8=60 时代可选种族,class 11=德鲁伊。
 */

export const RACE_NAMES: Record<number, string> = {
  1: "人类",
  2: "兽人",
  3: "矮人",
  4: "暗夜精灵",
  5: "亡灵",
  6: "牛头人",
  7: "侏儒",
  8: "巨魔",
};

export const CLASS_NAMES: Record<number, string> = {
  1: "战士",
  2: "圣骑士",
  3: "猎人",
  4: "潜行者",
  5: "牧师",
  7: "萨满祭司",
  8: "法师",
  9: "术士",
  11: "德鲁伊",
};

/** 60 时代合法 race→class 组合(经典矩阵) */
export const RACE_CLASSES: Record<number, readonly number[]> = {
  1: [1, 2, 4, 5, 8, 9],
  2: [1, 3, 4, 7, 9],
  3: [1, 2, 3, 4, 5],
  4: [1, 3, 4, 5, 11],
  5: [1, 4, 5, 8, 9],
  6: [1, 3, 7, 11],
  7: [1, 4, 8, 9],
  8: [1, 3, 4, 5, 7, 8],
};

export const PORTRAIT_DEFAULT = "/portraits/default.svg";

/** race/class/gender → 头像站点路径;非法组合返回 null(调用方降级默认图) */
export function portraitPath(
  race: number,
  klass: number,
  gender: number,
): string | null {
  if (gender !== 0 && gender !== 1) return null;
  if (!RACE_CLASSES[race]?.includes(klass)) return null;
  return `/portraits/${race}-${klass}-${gender}.svg`;
}
