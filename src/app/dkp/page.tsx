import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";

const page = findToolPage("/dkp");
export const metadata: Metadata = { title: `${page?.title ?? "DKP 查询"} · 老克塔` };

export default function DkpPage() {
  return page ? <ToolPageShell page={page} activePath="/dkp" /> : null;
}
