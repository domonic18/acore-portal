import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/playermap");
export const metadata: Metadata = {
  title: `${page?.title ?? "在线地图"} · 老克塔`,
};

export default function PlayermapPage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
