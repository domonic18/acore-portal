"use client";

import { useEffect, useState } from "react";
import type { ServerStatusResult } from "@/lib/status-types";
import { SectionHeader } from "@/components/site/section-header";

/**
 * 首页服务器状态卡(US6/S6;2026-10 ardot 设计稿 p01-s1 对齐):
 * SSR 初值 + 30s 轮询 /api/status;大数字 + 阵营比条 + 双列 chip。
 * enabled=false 整卡隐藏;degraded 挂「数据延迟」徽标并保留缓存值;
 * 冷启动失败数字字段 null 按 "--"/N/A 两态渲染(SC-208)。
 * testid 契约:online-count 纯数字、faction "N : M"、queue "N"/"N/A"。
 */
const POLL_INTERVAL_MS = 30_000;

function fmt(n: number | null): string {
  return n === null ? "--" : String(n);
}

export function StatusCard({ initial }: { initial: ServerStatusResult }) {
  const [status, setStatus] = useState(initial);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/status", { cache: "no-store" });
        if (!res.ok) return;
        const next = (await res.json()) as ServerStatusResult;
        if (alive) setStatus(next);
      } catch {
        // 网络抖动保留上次渲染,下个周期重试
      }
    };
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!status.enabled) return null;

  const factionTotal = (status.allianceCount ?? 0) + (status.hordeCount ?? 0);
  const allyPct = factionTotal > 0 ? ((status.allianceCount ?? 0) / factionTotal) * 100 : 50;
  const online = status.online;

  const chips: { label: string; testid: string; value: string; gold?: boolean }[] = [
    { label: "登录队列", testid: "status-queue", value: status.queueCount === null ? "N/A" : String(status.queueCount) },
    { label: "今日峰值", testid: "status-peak", value: fmt(status.todayPeak) },
    { label: "稳定运行", testid: "status-uptime", value: status.uptimeText ?? "--" },
    { label: "当前阶段", testid: "status-stage", value: status.currentStage ?? "待定", gold: true },
    { label: "角色总数", testid: "status-char-total", value: fmt(status.charTotal) },
    { label: "今日新注册", testid: "status-new-chars", value: fmt(status.todayNewChars) },
  ];

  return (
    <section
      data-testid="home-server-status"
      className="rounded-2xl border border-[#22385a] bg-[#13233a] p-5"
    >
      <SectionHeader
        title="服务器状态"
        meta="实时 · 30s 刷新"
        className="mb-4"
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div
            data-testid="status-online-count"
            className="text-[42px] font-bold leading-none text-[#a8d9f5]"
          >
            {fmt(status.onlineCount)}
          </div>
          <div className="mt-1.5 text-xs text-[#6482a3]">当前在线</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] ${
              online
                ? "border-[#57b87d]/60 text-[#57b87d]"
                : "border-[#c0564e]/60 text-[#c0564e]"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                online ? "bg-[#57b87d]" : "bg-[#c0564e]"
              }`}
            />
            {online ? "运行中" : "离线"}
          </span>
          {status.maintenanceMode && (
            <span
              data-testid="status-maintenance"
              className="rounded bg-[#5d4a1e] px-2 py-0.5 text-xs text-[#e8c877]"
            >
              维护模式
            </span>
          )}
          {status.degraded && (
            <span
              data-testid="status-degraded"
              className="rounded bg-[#5d553a] px-2 py-0.5 text-xs text-[#e8c877]"
            >
              数据延迟
            </span>
          )}
        </div>
      </div>

      {/* 阵营比条:联盟蓝/部落红;下方居中 "N : M"(E2E 契约:元素文本恰为该格式) */}
      <div className="mt-4">
        <div
          className="flex h-[22px] overflow-hidden rounded-full border border-[#22385a] text-[11px] leading-[20px] text-white/90"
          aria-hidden="true"
        >
          <span className="bg-[#2e5e96] text-center" style={{ width: `${allyPct}%` }}>
            {status.allianceCount !== null ? status.allianceCount : "--"}
          </span>
          <span className="bg-[#8e2f2a] text-center" style={{ width: `${100 - allyPct}%` }}>
            {status.hordeCount !== null ? status.hordeCount : "--"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-[#6482a3]">
          <span>联盟</span>
          <span data-testid="status-faction">
            {fmt(status.allianceCount)} : {fmt(status.hordeCount)}
          </span>
          <span>部落</span>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-2">
        {chips.map((c) => (
          <div
            key={c.label}
            className="flex items-center justify-between gap-2 rounded-lg bg-[#0d1828] px-3 py-2"
          >
            <dt className="shrink-0 text-[13px] text-[#6482a3]">{c.label}</dt>
            <dd
              data-testid={c.testid}
              className={`truncate text-sm font-medium ${
                c.gold ? "text-[#e8c877]" : "text-[#dcebf7]"
              }`}
              title={c.value}
            >
              {c.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-right text-xs text-[#6482a3]" suppressHydrationWarning>
        更新于 {new Date(status.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
      </p>
    </section>
  );
}
