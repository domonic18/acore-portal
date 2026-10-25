import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/dkp");
export const metadata: Metadata = { title: `${page?.title ?? "DKP 查询"} · 老克塔` };

export default function DkpPage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
