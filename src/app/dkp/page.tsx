import type { Metadata } from "next";
import { findToolPage } from "@/constants/tools";
import { ToolPageShell } from "@/components/site/tool-page-shell";
import { getToolPageView } from "@/server/services/tools/pages";

const meta = findToolPage("/dkp");
export const metadata: Metadata = { title: `${meta?.title ?? "DKP 查询"} · 老克塔` };

export default async function DkpPage() {
  const page = await getToolPageView("/dkp");
  return page ? <ToolPageShell page={page} activePath="/dkp" /> : null;
}
