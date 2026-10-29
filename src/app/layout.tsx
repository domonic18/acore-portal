import type { Metadata } from "next";
import Script from "next/script";
import { SiteFooter } from "@/components/site/footer";
import { HideOnAdmin } from "@/components/site/chrome-gate";
import { SiteHeader } from "@/app/_components/site-header";
import { getConfig } from "@/lib/config";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "老克塔 · AzerothCore 怀旧社区",
  description: "魔兽世界 60 年代怀旧服社区门户(怀旧公益项目)",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // FR-312:umami 组存在才注入 tracking script;build 期(假 DATABASE_URL
  // 预渲染 /_not-found 等)取不到配置时静默跳过,不阻塞渲染
  const umami = await getConfig()
    .then((c) => c.umami)
    .catch(() => undefined);

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col antialiased">
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
