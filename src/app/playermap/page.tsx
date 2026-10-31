import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/playermap");
export const metadata: Metadata = {
  title: `${page?.title ?? "在线地图"} · 老克塔`,
};

export default function PlayermapPage() {
  return page ? <ToolPageShell page={page} activePath="/playermap" /> : null;
}
