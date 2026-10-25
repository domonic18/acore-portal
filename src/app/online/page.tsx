import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/online");
export const metadata: Metadata = { title: `${page?.title ?? "在线查询"} · 老克塔` };

export default function OnlinePage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
