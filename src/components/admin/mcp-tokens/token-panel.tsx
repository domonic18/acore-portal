"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { MCP_SCOPE, type McpTokenView } from "@/constants/mcp";

import type { McpBusy } from "./types";

const SCOPE_LABEL: Record<string, string> = {
  [MCP_SCOPE.READ]: "只读",
  [MCP_SCOPE.WRITE]: "可写",
};

/**
 * 访问令牌卡(①):掩码令牌 + 复制 + 轮换 + 作用域(2026-11-19 用户反馈)
 *
 * 口径:
 * - 令牌**默认已有一枚**(进页自动补发),掩码显示,随时可复制明文;
 * - 轮换 = 换一枚新令牌,旧令牌即时失效(没有单独的吊销入口);
 * - 令牌**无有效期**;风险靠「轮换」与「作用域只读」两道闸控;
 * - 作用域切换即时生效,无需轮换。
 */
export function TokenPanel({
  token,
  todayCalls,
  busy,
  onCopy,
  onRotate,
  onScopeChange,
}: {
  token: McpTokenView;
  todayCalls: number;
  busy: McpBusy;
  onCopy: () => Promise<boolean>;
  onRotate: () => Promise<boolean>;
  onScopeChange: (scope: "read" | "write") => Promise<boolean>;
}) {
  const hydrated = useHydrated();
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function handleCopy() {
    if (await onCopy()) setCopied(true);
  }

  async function handleRotate() {
    if (await onRotate()) setConfirmRotate(false);
  }

  const scope = token.scope ?? MCP_SCOPE.WRITE;

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-heading">访问令牌</h2>
        <span
          data-testid="mcp-token-status"
          className={token.configured ? "text-[13px] text-ok-bright" : "text-[13px] text-muted"}
        >
          {token.configured ? "生效中" : "未配置"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-panel-inset px-3 py-2.5">
        <code
          data-testid="mcp-token-masked"
          className="min-w-0 flex-1 break-all font-mono text-[13px] text-heading"
        >
          {token.maskedToken || "—"}
        </code>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleCopy}
          disabled={busy !== null || !hydrated}
        >
          {busy === "reveal" ? "取回中…" : "复制令牌"}
        </Button>
        {confirmRotate ? (
          <span className="flex items-center gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={handleRotate}
              disabled={busy !== null}
            >
              确认轮换
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRotate(false)}>
              取消
            </Button>
          </span>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setConfirmRotate(true)}
            disabled={busy !== null || !hydrated}
          >
            {busy === "rotate" ? "轮换中…" : "轮换令牌"}
          </Button>
        )}
        {copied && <span className="text-[13px] text-ok-bright">已复制到剪贴板</span>}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-muted">作用域</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-line">
          {(["read", "write"] as const).map((value) => (
            <button
              key={value}
              type="button"
              data-testid={`mcp-scope-${value}`}
              aria-pressed={scope === value}
              disabled={busy !== null || !hydrated}
              onClick={() => void onScopeChange(value)}
              className={`px-3 py-1 text-[12.5px] disabled:opacity-60 ${
                scope === value
                  ? "bg-[#164a6e] font-semibold text-[#cfe9fb]"
                  : "bg-panel-inset text-muted hover:text-heading"
              }`}
            >
              {SCOPE_LABEL[value]}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-muted">切换即时生效,无需轮换;只读令牌调写工具返回 403</span>
      </div>

      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted">有效期</dt>
          <dd className="text-body">长期有效(无过期)</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">签发时刻</dt>
          <dd className="text-body">{token.issuedAt ? formatDateTime(token.issuedAt) : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">绑定管理员</dt>
          <dd className="text-body">{token.adminUserId || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">今日调用</dt>
          <dd className="text-body">
            {todayCalls} / {token.dailyLimit}
          </dd>
        </div>
      </dl>

      <p className="text-[12px] text-muted">
        令牌等同管理员凭证,泄露请立即轮换(旧令牌即时失效);明文仅管理员会话可取,取回动作留审计。
      </p>
    </section>
  );
}
