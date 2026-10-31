import type { Metadata } from "next";
import Script from "next/script";
import { SiteFooter } from "@/components/site/footer";
import { HideOnAdmin } from "@/components/site/chrome-gate";
import { SiteHeader } from "@/app/_components/site-header";
import { getConfig } from "@/lib/config";
import "@/styles/globals.css";

/** 配置不可用(build 期预渲染/库未就绪)时的外观兜底,与 configSchema 默认值一致 */
const DEFAULT_APPEARANCE = {
  logoUrl: "/logo.png",
  faviconUrl: "/favicon-32.png",
  headerBackgroundUrl: "/background.jpg",
  pageBackgroundUrl: "/background.jpg",
};

export async function generateMetadata(): Promise<Metadata> {
  const favicon = await getConfig()
    .then((c) => c.appearance.faviconUrl)
    .catch(() => DEFAULT_APPEARANCE.faviconUrl);
  return {
    title: "老克塔 · AzerothCore 怀旧社区",
    description: "魔兽世界 60 年代怀旧服社区门户(怀旧公益项目)",
    icons: {
      icon: favicon || DEFAULT_APPEARANCE.faviconUrl,
      apple: "/apple-touch-icon.png",
    },
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FR-312:umami 组存在才注入 tracking script;build 期(假 DATABASE_URL
  // 预渲染 /_not-found 等)取不到配置时静默跳过,不阻塞渲染
  const config = await getConfig().catch(() => null);
  const umami = config?.umami;
  const appearance = config?.appearance ?? DEFAULT_APPEARANCE;
  // 页面背景图:暗色叠层压在场景图之上,保证正文可读;留空=纯色底
  const pageBackground = appearance.pageBackgroundUrl
    ? {
        backgroundImage: `linear-gradient(rgba(10, 18, 32, 0.6), rgba(10, 18, 32, 0.6)), url("${appearance.pageBackgroundUrl}")`,
        backgroundSize: "cover",
        backgroundPosition: "center top",
        backgroundAttachment: "fixed",
        backgroundRepeat: "no-repeat",
      }
    : undefined;

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col antialiased" style={pageBackground}>
        <HideOnAdmin>
          <SiteHeader />
        </HideOnAdmin>
        <div className="flex-1">{children}</div>
        <HideOnAdmin>
          <SiteFooter />
        </HideOnAdmin>
        {umami && (
          <Script
            src={umami.scriptUrl}
            data-website-id={umami.websiteId}
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
