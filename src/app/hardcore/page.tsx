import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/hardcore");
export const metadata: Metadata = {
  title: `${meta?.title ?? "英雄榜"} · 老克塔`,
};

export default async function HardcorePage() {
  const page = await getToolPageView("/hardcore");
  return page ? <ToolPageShell page={page} activePath="/hardcore" /> : null;
}
