import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/online-players");
export const metadata: Metadata = {
  title: `${page?.title ?? "在线玩家"} · 老克塔`,
};

export default function OnlinePlayersPage() {
  return page ? (
    <ToolPageShell page={page} activePath="/online-players" />
  ) : null;
}
