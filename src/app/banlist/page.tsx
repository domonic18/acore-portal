import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/banlist");
export const metadata: Metadata = {
  title: `${meta?.title ?? "封号记录"} · 老克塔`,
};

export default async function BanlistPage() {
  const page = await getToolPageView("/banlist");
  return page ? <ToolPageShell page={page} activePath="/banlist" /> : null;
}
