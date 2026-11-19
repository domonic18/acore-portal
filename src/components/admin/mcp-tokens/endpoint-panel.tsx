"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { MCP_TOOL } from "@/constants/mcp";

/**
 * 服务地址与接入示例卡(2026-11-19 用户反馈:光有令牌不够,还得给出
 * 「往哪连、怎么连」——照 aitech-hub PAT 页的接入面板口径)
 *
 * MCP 是单端点 Streamable HTTP:地址由站点 URL 派生,客户端一律走
 * Authorization: Bearer &lt;令牌&gt; 头。示例里的令牌用掩码串占位,
 * 复制真令牌请用上方「复制令牌」。
 */
export function EndpointPanel({ endpoint, maskedToken }: { endpoint: string; maskedToken: string }) {
  const [copied, setCopied] = useState(false);
  const tokenPlaceholder = maskedToken || "lokta_mcp_••••••••••••";

  async function copyEndpoint() {
    try {
      await navigator.clipboard.writeText(endpoint);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const claudeCli = `claude mcp add lokta-shop --transport http ${endpoint} \\
  --header "Authorization: Bearer ${tokenPlaceholder}"`;

  const mcpJson = `{
  "mcpServers": {
    "lokta-shop": {
      "type": "http",
      "url": "${endpoint}",
      "headers": { "Authorization": "Bearer ${tokenPlaceholder}" }
    }
  }
}`;

  const toolSurface = Object.values(MCP_TOOL).join(" / ");

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-heading">服务地址与接入示例</h2>
        <span className="rounded border border-line px-2 py-0.5 text-[11px] tracking-wide text-muted">
          STREAMABLE HTTP
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel-inset px-3 py-2.5">
        <code data-testid="mcp-endpoint" className="min-w-0 flex-1 break-all font-mono text-[13px] text-link">
          {endpoint}
        </code>
        <Button type="button" variant="secondary" size="sm" onClick={copyEndpoint}>
          复制地址
        </Button>
        {copied && <span className="text-[13px] text-ok-bright">已复制</span>}
      </div>

      <div>
        <p className="text-[12.5px] font-semibold text-heading">Claude Code(命令行一键接入)</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre rounded-lg border border-line bg-panel-inset p-3 font-mono text-[11.5px] leading-relaxed text-body">
          {claudeCli}
        </pre>
      </div>

      <div>
        <p className="text-[12.5px] font-semibold text-heading">
          Claude Code / Cursor / 通用 MCP 客户端(.mcp.json)
        </p>
        <pre className="mt-1 overflow-x-auto whitespace-pre rounded-lg border border-line bg-panel-inset p-3 font-mono text-[11.5px] leading-relaxed text-body">
          {mcpJson}
        </pre>
      </div>

      <div>
        <p className="text-[12.5px] font-semibold text-heading">
          WorkBuddy(~/.workbuddy/mcp.json,同 mcpServers 格式)
        </p>
        <pre className="mt-1 overflow-x-auto whitespace-pre rounded-lg border border-line bg-panel-inset p-3 font-mono text-[11.5px] leading-relaxed text-body">
          {mcpJson}
        </pre>
      </div>

      <p className="text-[12px] leading-relaxed text-muted">
        工具面({Object.keys(MCP_TOOL).length} 个):{toolSurface}
        —— 示例中的令牌请用上方「复制令牌」取到的完整值替换。
      </p>
    </section>
  );
}
