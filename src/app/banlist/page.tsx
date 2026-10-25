import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/banlist");
export const metadata: Metadata = {
  title: `${page?.title ?? "封号记录"} · 老克塔`,
};

export default function BanlistPage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
