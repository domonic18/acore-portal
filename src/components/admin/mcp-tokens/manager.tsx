"use client";

import { useState } from "react";

import { errorMessage, requestJson } from "@/lib/api-client";
import type { McpAdminView } from "@/constants/mcp";

import { CallsPanel } from "./calls-panel";
import { EndpointPanel } from "./endpoint-panel";
import { LimitsPanel } from "./limits-panel";
import { TokenPanel } from "./token-panel";
import type { McpBusy } from "./types";

/**
 * 后台 MCP 接入管理(二期 M6)
 *
 * 本组件只做「取数 + 编排」:数据形状与展示由各分册卡片承担
 * (令牌卡 / 限额卡 / 接入示例卡 / 最近调用)。
 *
 * 口径(2026-11-19 用户反馈,MiniMax 式令牌):
 * - 令牌默认已有一枚(进页自动补发),掩码显示,随时复制明文;
 * - 轮换 = 换新令牌,旧令牌即时失效(无独立的吊销入口);
 * - 作用域(只读/可写)即时切换,无需轮换;
 * - 整页只有一个可访问名含「保存」的按钮(在限额卡)。
 */
export function McpTokensManager({ initial }: { initial: McpAdminView }) {
  const [view, setView] = useState<McpAdminView>(initial);
  const [busy, setBusy] = useState<McpBusy>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const body = await requestJson<McpAdminView>("/api/admin/mcp-token");
    setView(body);
  }

  /** 复制令牌:取回明文并写入剪贴板 */
  async function copyToken(): Promise<boolean> {
    if (busy) return false;
    setBusy("reveal");
    setError(null);
    try {
      const body = await requestJson<{ plain: string }>("/api/admin/mcp-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reveal" }),
      });
      await navigator.clipboard.writeText(body.plain);
      await refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** 轮换令牌:新令牌覆盖旧令牌 */
  async function rotate(): Promise<boolean> {
    if (busy) return false;
    setBusy("rotate");
    setError(null);
    try {
      await requestJson("/api/admin/mcp-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "rotate" }),
      });
      await refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** 作用域即时切换 */
  async function changeScope(scope: "read" | "write"): Promise<boolean> {
    if (busy) return false;
    setBusy("scope");
    setError(null);
    try {
      await requestJson("/api/admin/mcp-token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenScope: scope }),
      });
      await refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  /** 调整限额;成功返回 true */
  async function saveLimits(limits: {
    qpsLimit: number;
    dailyLimit: number;
    ipMaxPerMin: number;
  }): Promise<boolean> {
    if (busy) return false;
    const { qpsLimit: qps, dailyLimit: daily, ipMaxPerMin: ip } = limits;
    if (
      !Number.isInteger(qps) || qps < 1 || qps > 60 ||
      !Number.isInteger(daily) || daily < 1 || daily > 100000 ||
      !Number.isInteger(ip) || ip < 1 || ip > 600
    ) {
      setError("限额须为整数:每令牌 QPS 1-60、每日调用 1-100000、IP 兜底 1-600。");
      return false;
    }
    setBusy("limits");
    setError(null);
    try {
      await requestJson("/api/admin/mcp-token", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ qpsLimit: qps, dailyLimit: daily, ipMaxPerMin: ip }),
      });
      await refresh();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] text-danger"
        >
          {error}
        </p>
      )}

      <TokenPanel
        token={view.token}
        todayCalls={view.todayCalls}
        busy={busy}
        onCopy={copyToken}
        onRotate={rotate}
        onScopeChange={changeScope}
      />
      <LimitsPanel token={view.token} busy={busy} onSave={saveLimits} />
      <EndpointPanel endpoint={view.endpoint} maskedToken={view.token.maskedToken} />
      <CallsPanel calls={view.recentCalls} />
    </div>
  );
}
