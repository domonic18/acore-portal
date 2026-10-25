import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";

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
