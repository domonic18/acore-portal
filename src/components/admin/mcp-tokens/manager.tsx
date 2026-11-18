"use client";

import { useState } from "react";

import { errorMessage, requestJson } from "@/lib/api-client";
import type { McpAdminView } from "@/constants/mcp";

import { CallsPanel } from "./calls-panel";
import { LimitsPanel } from "./limits-panel";
import { TokenPanel } from "./token-panel";
import type { McpBusy } from "./types";

/**
 * 后台 MCP 令牌管理(二期 M6)
 *
 * 本组件只做「取数 + 编排」:数据形状与展示由各分册卡片承担
 * (令牌卡 / 限额卡 / 最近调用)。
 *
 * 口径:
 * - 令牌明文**只在签发响应里出现一次**,页面当场展示 + 复制,提示「仅显示一次」;
 * - 签发即轮换(旧令牌即时作废);吊销 = 清空哈希;
 * - 限额(QPS / 每日配额 / IP 兜底闸)可随时调整;
 * - 整页只有一个可访问名含「保存」的按钮(保存限额),其余动作用「签发」「吊销」措辞。
 */
export function McpTokensManager({ initial }: { initial: McpAdminView }) {
  const [view, setView] = useState<McpAdminView>(initial);
  const [busy, setBusy] = useState<McpBusy>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const body = await requestJson<McpAdminView>("/api/admin/mcp-token");
    setView(body);
  }

  /** 签发并轮换;返回明文(失败返回 null,错误已落到页首横幅) */
  async function issue(scope: string, ttlDays: number): Promise<string | null> {
    if (busy) return null;
    if (!Number.isInteger(ttlDays) || ttlDays < 1 || ttlDays > 365) {
      setError("有效天数须是 1-365 的整数。");
      return null;
    }
    setBusy("issue");
    setError(null);
    try {
      const body = await requestJson<{ token: McpAdminView["token"]; plain: string }>(
        "/api/admin/mcp-token",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ scope, ttlDays }),
        },
      );
      await refresh();
      return body.plain;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(null);
    }
  }

  /** 吊销令牌(清空哈希);成功返回 true */
  async function revoke(): Promise<boolean> {
    if (busy) return false;
    setBusy("revoke");
    setError(null);
    try {
      await requestJson("/api/admin/mcp-token", { method: "DELETE" });
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
        onIssue={issue}
        onRevoke={revoke}
      />
      <LimitsPanel token={view.token} busy={busy} onSave={saveLimits} />
      <CallsPanel calls={view.recentCalls} />
    </div>
  );
}
