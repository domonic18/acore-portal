import type { Metadata } from "next";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/app/_components/site-header";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "老克塔 · AzerothCore 怀旧社区",
  description: "魔兽世界 60 年代怀旧服社区门户(怀旧公益项目)",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen flex-col antialiased">
        <SiteHeader />
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
