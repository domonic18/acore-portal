import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";

// base 随 system_config 变;禁 build 期预渲染(构建环境无 DB,占位连接串必失败)
export const dynamic = "force-dynamic";

// T035(契约 tools-and-seo §robots):五条 Disallow+Sitemap 行
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { app } = await getConfig();
  const base = app.url.replace(/\/+$/, "");
  return {
    rules: {
      userAgent: "*",
      disallow: ["/admin", "/account", "/api", "/cart", "/checkout"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
