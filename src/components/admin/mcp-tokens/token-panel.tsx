"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { formatDateTime } from "@/lib/format";
import { useHydrated } from "@/lib/use-hydrated";
import { MCP_DEFAULT_TOKEN_TTL_DAYS, MCP_SCOPE, type McpTokenView } from "@/constants/mcp";

import type { McpBusy } from "./types";

const SCOPE_LABEL: Record<string, string> = {
  [MCP_SCOPE.READ]: "只读",
  [MCP_SCOPE.WRITE]: "可写",
};

/**
 * 令牌卡(①):状态/作用域/有效期/绑定管理员 + 签发与吊销
 *
 * 口径:
 * - 令牌明文**只在签发响应里出现一次**,页面当场展示 + 复制,提示「仅显示一次」;
 * - 签发即轮换(旧令牌即时作废);吊销 = 清空哈希;
 * - 整页只有一个可访问名含「保存」的按钮(在限额卡),其余动作用「签发」「吊销」措辞。
 */
export function TokenPanel({
  token,
  todayCalls,
  busy,
  onIssue,
  onRevoke,
}: {
  token: McpTokenView;
  todayCalls: number;
  busy: McpBusy;
  onIssue: (scope: string, ttlDays: number) => Promise<string | null>;
  onRevoke: () => Promise<boolean>;
}) {
  const hydrated = useHydrated();
  const [scope, setScope] = useState<string>(MCP_SCOPE.WRITE);
  const [ttlDays, setTtlDays] = useState(String(MCP_DEFAULT_TOKEN_TTL_DAYS));
  const [issuedPlain, setIssuedPlain] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyPlain() {
    if (!issuedPlain) return;
    try {
      await navigator.clipboard.writeText(issuedPlain);
      setCopyError(null);
      setCopied(true);
    } catch {
      setCopied(false);
      setCopyError("复制失败,请手动选中明文复制。");
    }
  }

  async function handleIssue() {
    const plain = await onIssue(scope, Number(ttlDays));
    if (plain) {
      setIssuedPlain(plain);
      setCopied(false);
    }
  }

  async function handleRevoke() {
    if (await onRevoke()) {
      setConfirmRevoke(false);
      setIssuedPlain(null);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel-strong p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-heading">访问令牌</h2>
        <span
          data-testid="mcp-token-status"
          className={token.configured ? "text-[13px] text-ok-bright" : "text-[13px] text-muted"}
        >
          {token.configured ? "已配置" : "未签发"}
        </span>
      </div>

      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="text-muted">作用域</dt>
          <dd className="text-body">{token.scope ? SCOPE_LABEL[token.scope] : "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">令牌前缀</dt>
          <dd className="font-mono text-body">{token.tokenPrefix || "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-muted">有效期至</dt>
          <dd className="text-body">{token.expiresAt ? formatDateTime(token.expiresAt) : "—"}</dd>
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

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted">作用域</span>
          <Select
            value={scope}
            aria-label="令牌作用域"
            disabled={!hydrated || busy !== null}
            onChange={(e) => setScope(e.target.value)}
            className="w-32"
          >
            <option value={MCP_SCOPE.WRITE}>可写(可改商品)</option>
            <option value={MCP_SCOPE.READ}>只读(仅查询)</option>
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted">有效天数</span>
          <Input
            type="number"
            min={1}
            max={365}
            value={ttlDays}
            aria-label="令牌有效天数"
            disabled={busy !== null}
            onChange={(e) => setTtlDays(e.target.value)}
            className="w-24"
          />
        </label>
        <Button
          type="button"
          variant="primary"
          onClick={handleIssue}
          disabled={busy !== null || !hydrated}
        >
          {busy === "issue" ? "签发中…" : "签发新令牌"}
        </Button>
        {token.configured &&
          (confirmRevoke ? (
            <span className="flex items-center gap-2">
              <Button type="button" variant="danger" onClick={handleRevoke} disabled={busy !== null}>
                确认吊销
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmRevoke(false)}>
                取消
              </Button>
            </span>
          ) : (
            <Button
              type="button"
              variant="danger"
              onClick={() => setConfirmRevoke(true)}
              disabled={busy !== null}
            >
              吊销令牌
            </Button>
          ))}
      </div>

      <p className="text-[12px] text-muted">
        签发即轮换:旧令牌立刻作废,同时只有一枚活跃令牌。令牌明文只在签发时出现一次,库中仅存哈希,丢失只能重新签发。
      </p>

      {issuedPlain && (
        <div className="flex flex-col gap-2 rounded-lg border border-warn/40 bg-warn/10 p-3">
          <p className="text-[13px] text-warn">
            新令牌明文(仅显示一次,请立即复制保存):
          </p>
          <code
            data-testid="mcp-token-plain"
            className="block break-all rounded bg-page/60 px-2 py-1.5 font-mono text-[12px] text-foreground"
          >
            {issuedPlain}
          </code>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={copyPlain}>
              复制
            </Button>
            {copied && <span className="text-[13px] text-ok-bright">已复制</span>}
            {copyError && (
              <span role="alert" className="text-[13px] text-danger">
                {copyError}
              </span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setIssuedPlain(null)}>
              隐藏明文
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
