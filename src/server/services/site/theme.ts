import "server-only";
import { getConfig } from "@/lib/config";
import { DEFAULT_THEME, isThemeId, type ThemeId } from "@/constants/theme";

/**
 * 站点主题取数(2026-11-06 主题系统):
 * 当前主题 id + 该主题生效的背景资源(页头/页面/面板)。
 * 主题槽位留空=回落 appearance 组的通用背景配置(面板无对应项,留空=纯色底);
 * 色板本身在 styles/globals.css,由 <html data-theme> 选择,此处只解析资源与 id。
 */

export type ThemeAssets = {
  headerBackgroundUrl: string;
  pageBackgroundUrl: string;
  panelBackgroundUrl: string;
};

export type ActiveTheme = {
  id: ThemeId;
  assets: ThemeAssets;
};

/** 兜底主题(build 期无配置):与 configSchema 的 theme 默认值一致 */
const FALLBACK_THEME: ActiveTheme = {
  id: DEFAULT_THEME,
  assets: {
    headerBackgroundUrl: "/background.jpg",
    pageBackgroundUrl: "/background.jpg",
    panelBackgroundUrl: "",
  },
};

/** 读取当前主题;配置不可用(build 预渲染/库未就绪)时回落默认主题 */
export async function getActiveTheme(): Promise<ActiveTheme> {
  const config = await getConfig().catch(() => null);
  if (!config) return FALLBACK_THEME;

  const id = isThemeId(config.theme.active) ? config.theme.active : DEFAULT_THEME;
  const slot = config.theme;
  return {
    id,
    assets: {
      headerBackgroundUrl:
        slot[`${id}.headerBackgroundUrl`] || config.appearance.headerBackgroundUrl,
      pageBackgroundUrl:
        slot[`${id}.pageBackgroundUrl`] || config.appearance.pageBackgroundUrl,
      panelBackgroundUrl: slot[`${id}.panelBackgroundUrl`],
    },
  };
}
