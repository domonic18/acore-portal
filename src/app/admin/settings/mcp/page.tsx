import { requireAdmin } from "@/server/session-guard";
import { readMcpAdminView } from "@/server/services/mcp/admin";
import { ensureMcpToken } from "@/server/services/mcp/auth";
import { McpTokensManager } from "@/components/admin/mcp-tokens/manager";

/**
 * 系统设置 · MCP 接入(二期 M6;规格 §17.3)
 *
 * 令牌默认已有一枚(进页自动补发),掩码显示、随时复制、随时轮换、无有效期;
 * 同时给出服务地址与常见 agent(Claude Code / WorkBuddy / Cursor)的接入示例。
 */
export default async function AdminSettingsMcpPage() {
  const session = await requireAdmin();
  // 传会话管理员身份:补发/回填把令牌绑定到当前管理员(论坛写工具的实名 actor)
  await ensureMcpToken(BigInt(session.userId));
  const view = await readMcpAdminView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        商品运营 MCP 的访问令牌与服务接入:令牌长期有效(无有效期),掩码显示、随时复制,轮换后旧令牌立即失效。
        工具面恒 12 个,写入仍走后台同一入口与同一套校验。
      </p>
      <McpTokensManager initial={view} />
    </div>
  );
}
