import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/hardcore");
export const metadata: Metadata = {
  title: `${page?.title ?? "英雄榜"} · 老克塔`,
};

export default function HardcorePage() {
  return page ? <ToolPageShell page={page} activePath="/hardcore" /> : null;
}
