"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { McpTokenView } from "@/constants/mcp";

import type { McpBusy } from "./types";

/**
 * 限额卡(②):QPS / 每日配额 / IP 兜底闸
 *
 * 整页唯一可访问名含「保存」的按钮就在这里(「保存限额」)。
 * 限额可随时调整,即时生效;输入越界由服务端与本页双重把关。
 */
export function LimitsPanel({
  token,
  busy,
  onSave,
}: {
  token: McpTokenView;
  busy: McpBusy;
  onSave: (limits: {
    qpsLimit: number;
    dailyLimit: number;
    ipMaxPerMin: number;
  }) => Promise<boolean>;
}) {
  const [qpsLimit, setQpsLimit] = useState(String(token.qpsLimit));
  const [dailyLimit, setDailyLimit] = useState(String(token.dailyLimit));
  const [ipMaxPerMin, setIpMaxPerMin] = useState(String(token.ipMaxPerMin));
  const [saved, setSaved] = useState(false);

  const dirty = useMemo(
    () =>
      qpsLimit !== String(token.qpsLimit) ||
      dailyLimit !== String(token.dailyLimit) ||
      ipMaxPerMin !== String(token.ipMaxPerMin),
    [qpsLimit, dailyLimit, ipMaxPerMin, token],
  );

  async function handleSave() {
    setSaved(false);
    const ok = await onSave({
      qpsLimit: Number(qpsLimit),
      dailyLimit: Number(dailyLimit),
      ipMaxPerMin: Number(ipMaxPerMin),
    });
    if (ok) setSaved(true);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-panel-strong p-4">
      <h2 className="text-[14px] font-semibold text-heading">调用限额</h2>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted">每令牌 QPS(1-60)</span>
          <Input
            type="number"
            min={1}
            max={60}
            value={qpsLimit}
            aria-label="每令牌 QPS 上限"
            disabled={busy !== null}
            onChange={(e) => setQpsLimit(e.target.value)}
            className="w-24"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted">每日调用上限(1-100000)</span>
          <Input
            type="number"
            min={1}
            max={100000}
            value={dailyLimit}
            aria-label="每日调用上限"
            disabled={busy !== null}
            onChange={(e) => setDailyLimit(e.target.value)}
            className="w-32"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-muted">IP 兜底闸(次/分,1-600)</span>
          <Input
            type="number"
            min={1}
            max={600}
            value={ipMaxPerMin}
            aria-label="IP 兜底限速"
            disabled={busy !== null}
            onChange={(e) => setIpMaxPerMin(e.target.value)}
            className="w-24"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          onClick={handleSave}
          disabled={busy !== null || !dirty}
        >
          {busy === "limits" ? "保存中…" : "保存限额"}
        </Button>
        {saved && !dirty && <span className="text-[13px] text-ok-bright">已保存,即刻生效。</span>}
        {!dirty && !saved && <span className="text-[13px] text-muted">当前限额已是最新。</span>}
      </div>
      <p className="text-[12px] text-muted">
        令牌级限额失败关闭:限速依赖不可用时直接拒绝(503),不放开无限调用;IP 兜底闸失败开放,只挡洪泛不充当配额。
      </p>
    </section>
  );
}
