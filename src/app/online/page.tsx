import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/online");
export const metadata: Metadata = { title: `${page?.title ?? "在线查询"} · 老克塔` };

export default function OnlinePage() {
  return page ? <ToolPageShell page={page} activePath="/online" /> : null;
}
