import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/online-players");
export const metadata: Metadata = {
  title: `${meta?.title ?? "在线玩家"} · 老克塔`,
};

export default async function OnlinePlayersPage() {
  const page = await getToolPageView("/online-players");
  return page ? (
    <ToolPageShell page={page} activePath="/online-players" />
  ) : null;
}
