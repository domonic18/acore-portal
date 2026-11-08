import type { Metadata } from "next";
import { headers } from "next/headers";
import { SiteFooter } from "@/components/site/footer";
import { HideOnAdmin } from "@/components/site/chrome-gate";
import { SiteHeaderClient } from "@/components/site/header-client";
import { PageViewBeacon } from "@/components/site/page-view-beacon";
import { PortalPageBackground } from "@/components/site/portal-page-background";
import { getSiteFooterView, getSiteHeaderView } from "@/server/services/site/chrome";
import { getActiveTheme } from "@/server/services/site/theme";
import { getConfig } from "@/lib/config";
import { ADMIN_SURFACE_HEADER, ADMIN_SURFACE_VALUE } from "@/constants/admin";
import "@/styles/globals.css";

/** 配置不可用(build 期预渲染/库未就绪)时的 favicon 兜底,与 configSchema 默认值一致 */
const DEFAULT_FAVICON = "/favicon-32.png";

/**
 * 背景图层:暗色遮罩压在场景图之上保证正文可读;
 * 遮罩色取主题变量(--theme-*-overlay),故换主题时遮罩随之切换。
 * 背景图地址空=纯色底(background-image:none)。
 */
function backgroundLayer(overlayVar: string, url: string): string {
  if (!url) return "none";
  return `linear-gradient(${overlayVar}, ${overlayVar}), url("${url}")`;
}

export async function generateMetadata(): Promise<Metadata> {
  const favicon = await getConfig()
    .then((c) => c.appearance.faviconUrl)
    .catch(() => DEFAULT_FAVICON);
  return {
    title: "老克塔 · AzerothCore 怀旧社区",
    description: "魔兽世界 60 年代怀旧服社区门户(怀旧公益项目)",
    icons: {
      icon: favicon || DEFAULT_FAVICON,
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [header, footer, theme] = await Promise.all([
    getSiteHeaderView(),
    getSiteFooterView(),
    getActiveTheme(),
  ]);
  // 后台表面(middleware 打标):不挂门户装饰大图,省掉每页 244KB 的 background.jpg 下载
  const isAdminSurface =
    (await headers()).get(ADMIN_SURFACE_HEADER) === ADMIN_SURFACE_VALUE;
  const pageBackground = backgroundLayer(
    "var(--theme-page-overlay)",
    theme.assets.pageBackgroundUrl,
  );
  // 主题变量挂在 <html>:CSS 自定义属性沿 DOM 继承,页头/内容面板无需逐层传参
  const themeStyle = {
    "--theme-page-background": isAdminSurface ? "none" : pageBackground,
    "--theme-header-background": backgroundLayer(
      "var(--theme-header-overlay)",
      theme.assets.headerBackgroundUrl,
    ),
    "--theme-panel-background": backgroundLayer(
      "var(--theme-panel-overlay)",
      theme.assets.panelBackgroundUrl,
    ),
  } as React.CSSProperties;

  return (
    <html lang="zh-CN" data-theme={theme.id} style={themeStyle}>
      <body className="flex min-h-screen flex-col antialiased">
        <HideOnAdmin>
          <SiteHeaderClient {...header} />
        </HideOnAdmin>
        <div className="flex-1">{children}</div>
        <HideOnAdmin>
          <SiteFooter
            name={footer.name}
            tagline={footer.tagline}
            icp={footer.icp}
            copyrightEn={footer.copyrightEn}
          />
        </HideOnAdmin>
        <PageViewBeacon />
        <PortalPageBackground pageBackground={pageBackground} />
      </body>
    </html>
  );
}
