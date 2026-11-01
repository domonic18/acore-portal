import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/playermap");
export const metadata: Metadata = {
  title: `${meta?.title ?? "在线地图"} · 老克塔`,
};

export default async function PlayermapPage() {
  const page = await getToolPageView("/playermap");
  return page ? <ToolPageShell page={page} activePath="/playermap" /> : null;
}
