import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/banlist");
export const metadata: Metadata = {
  title: `${page?.title ?? "封号记录"} · 老克塔`,
};

export default function BanlistPage() {
  return page ? <ToolPageShell page={page} activePath="/banlist" /> : null;
}
