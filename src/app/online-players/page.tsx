import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

const page = findToolPage("/online-players");
export const metadata: Metadata = {
  title: `${page?.title ?? "在线玩家"} · 老克塔`,
};

export default function OnlinePlayersPage() {
  return page ? <ToolsIframe src={page.iframeSrc} title={page.title} /> : null;
}
