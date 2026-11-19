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
  tbc: "TBC 暖金",
  wlk: "WLK 冰蓝",
};

/** 主题一句话说明(后台主题卡) */
export const THEME_DESCRIPTIONS: Record<ThemeId, string> = {
  tbc: "燃烧远征暖金棕,怀旧经典观感",
  wlk: "冰蓝冷色,巫妖王之怒气质",
};

/** 主题色板取样(后台主题卡的色板条;取自 styles/globals.css 的同名 token) */
export const THEME_SWATCHES: Record<ThemeId, readonly string[]> = {
  tbc: ["#63b0dd", "#f2ca72", "#14213a", "#1f3454", "#f7dfae"],
  wlk: ["#5cb8e6", "#9ad9f6", "#0f1d31", "#1b3046", "#c4e9fa"],
};

/** 主题缩略图配色(后台主题卡的站点概貌):取各主题真实 token 值,便于一眼分辨冷暖 */
export const THEME_THUMBNAIL: Record<
  ThemeId,
  {
    page: string;
    header: string;
    headerLine: string;
    brand: string;
    nav: string;
    heroBorder: string;
    heroText: string;
    card: string;
    cardLine: string;
  }
> = {
  tbc: {
    page: "#140e08",
    header: "#1a1006",
    headerLine: "#4a3820",
    brand: "#f2ca72",
    nav: "#6b5432",
    heroBorder: "#3a2c18",
    heroText: "#ffe3a6",
    card: "#1a1006",
    cardLine: "#3a2c18",
  },
  wlk: {
    page: "#0a1424",
    header: "#0c1a2b",
    headerLine: "#1f3454",
    brand: "#5cb8e6",
    nav: "#2f5080",
    heroBorder: "#1b3046",
    heroText: "#8ad4ff",
    card: "#0f1d31",
    cardLine: "#1b3046",
  },
};

/** 主题预览 cookie 名(后台主题页「整页预览」写入;仅影响当前浏览器) */
export const THEME_PREVIEW_COOKIE = "theme_preview";

export function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}
