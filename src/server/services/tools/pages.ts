import "server-only";
import { getConfig } from "@/lib/config";
import { findToolPage, toToolPageView, type ToolPageView } from "@/constants/tools";

/** 工具页取数:外部域地址来自 system_config(tools.rankBase/tools.dkpUrl),常量表只存来源与路径 */
export async function getToolPageView(path: string): Promise<ToolPageView | null> {
  const meta = findToolPage(path);
  if (!meta) return null;
  const { tools } = await getConfig();
  return toToolPageView(meta, tools);
}
