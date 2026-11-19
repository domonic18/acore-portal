import { permanentRedirect } from "next/navigation";

/**
 * /admin/mcp-tokens 旧入口(2026-11-19):MCP 接入并入设置页 Tab,
 * 旧路径 308 永久重定向到 /admin/settings/mcp(保留外链与书签可达)。
 */
export default function AdminMcpTokensPage(): never {
  permanentRedirect("/admin/settings/mcp");
}
