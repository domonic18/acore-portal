import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/hardcore");
export const metadata: Metadata = {
  title: `${page?.title ?? "英雄榜"} · 老克塔`,
};

export default function HardcorePage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
