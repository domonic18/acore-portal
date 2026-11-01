import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/online");
export const metadata: Metadata = { title: `${meta?.title ?? "在线查询"} · 老克塔` };

export default async function OnlinePage() {
  const page = await getToolPageView("/online");
  return page ? <ToolPageShell page={page} activePath="/online" /> : null;
}
