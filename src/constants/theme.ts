/**
 * 站点主题(2026-11-06 主题系统):
 * 两套色板 TBC(暖,原观感)/ WLK(冷),由 <html data-theme> 选择,
 * 后台「系统设置 → 站点主题」切换,保存即热生效(system_config theme.active)。
 *
 * 颜色一律按**角色**命名而非色相:同一角色在两套主题里可以换色相
 * (如 --theme-highlight:TBC 金 / WLK 冰蓝),故不得用 --theme-gold 这类色相名。
 * 新增主题时:在此登记 id,并在 styles/globals.css 补一套同名 token 值。
 */
export const THEME_IDS = ["tbc", "wlk"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "tbc";

/** 主题展示名(后台选择器与站点标题用) */
export const THEME_LABELS: Record<ThemeId, string> = {
  tbc: "TBC 暖色(默认)",
  wlk: "WLK 冷色",
};

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}
