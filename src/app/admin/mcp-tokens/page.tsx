import { McpTokensManager } from "@/components/admin/mcp-tokens/manager";
import { readMcpAdminView } from "@/server/services/mcp/admin";

/**
 * 后台「系统 → MCP 令牌」(二期 M6;规格 §17.3)
 *
 * 商品运营 MCP 的令牌与限额管理台:签发(=轮换)/吊销/限额调整 + 最近调用。
 * 令牌明文只写不读——签发响应里出现一次,后台不回看。
 */
export default async function AdminMcpTokensPage() {
  const view = await readMcpAdminView();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted">
        商品运营 MCP 的访问令牌:令牌只写不读(库中仅存哈希),签发即轮换,同时只有一枚活跃令牌。
        令牌只认商品能力的对外投影——写入仍走后台同一入口与同一套校验。
      </p>

      <McpTokensManager initial={view} />
    </div>
  );
}
