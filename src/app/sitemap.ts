import type { MetadataRoute } from "next";
import { getConfig } from "@/lib/config";
import { buildSitemapEntries } from "@/server/services/seo/sitemap";

// T035(契约 tools-and-seo §sitemap):base=config app.url
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [{ app }, entries] = await Promise.all([getConfig(), buildSitemapEntries()]);
  const base = app.url.replace(/\/+$/, "");
  return entries.map((e) => ({
    url: `${base}${e.path}`,
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
  }));
}
