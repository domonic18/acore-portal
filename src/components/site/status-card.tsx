"use client";

import Link from "next/link";
import type { ServerStatusResult } from "@/lib/status-types";
import { useStatusPoll } from "@/lib/use-status-poll";
import { SectionHeader } from "@/components/site/section-header";
import { formatTime } from "@/lib/format";

/**
 * 首页服务器状态卡(US6/S6;2026-10 ardot 设计稿 p01-s1 对齐):
 * SSR 初值 + 30s 轮询 /api/status(取数在 useStatusPoll Hook,issue #85 展示层无 IO);
 * 大数字 + 阵营比条 + 双列 chip。
 * enabled=false 整卡隐藏;degraded 挂「数据延迟」徽标并保留缓存值;
 * 冷启动失败数字字段 null 按 "--"/N/A 两态渲染(SC-208)。
 * testid 契约:online-count 纯数字、faction "N : M"。
 */

function fmt(n: number | null): string {
  return n === null ? "--" : String(n);
}

export function StatusCard({ initial }: { initial: ServerStatusResult }) {
  const status = useStatusPoll(initial);

  if (!status.enabled) return null;

  const factionTotal = (status.allianceCount ?? 0) + (status.hordeCount ?? 0);
  const allyPct = factionTotal > 0 ? ((status.allianceCount ?? 0) / factionTotal) * 100 : 50;
  const online = status.online;

  // 2026-11-04 #42:移除 今日峰值/稳定运行/角色总数,仅保留当前阶段
  // #53/#54:单行全宽完整展示(#42 后仅剩一枚 chip,原 grid-cols-2 半宽挤成两行),可点击直达渐进计划锚点
  const stage = status.currentStage;
  const stageNodeId = status.currentStageNodeId;

  return (
    <section
      data-testid="home-server-status"
      className="rounded-2xl border border-line bg-panel p-5"
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
            className="text-[42px] font-bold leading-none text-num"
          >
            {fmt(status.onlineCount)}
          </div>
          <div className="mt-1.5 text-xs text-muted">当前在线</div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] ${
              online
                ? "border-ok/60 text-ok"
                : "border-danger-offline/60 text-danger-offline"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                online ? "bg-ok" : "bg-danger-offline"
              }`}
            />
            {online ? "运行中" : "离线"}
          </span>
          {status.maintenanceMode && (
            <span
              data-testid="status-maintenance"
              className="rounded bg-warn-bg px-2 py-0.5 text-xs text-highlight"
            >
              维护模式
            </span>
          )}
          {status.degraded && (
            <span
              data-testid="status-degraded"
              className="rounded bg-warn-line px-2 py-0.5 text-xs text-highlight"
            >
              数据延迟
            </span>
          )}
        </div>
      </div>

      {/* 阵营比条:联盟蓝/部落红;下方居中 "N : M"(E2E 契约:元素文本恰为该格式) */}
      <div className="mt-4">
        <div
          className="flex h-[22px] overflow-hidden rounded-full border border-line text-[11px] leading-[20px] text-white/90"
          aria-hidden="true"
        >
          <span className="bg-ally text-center" style={{ width: `${allyPct}%` }}>
            {status.allianceCount !== null ? status.allianceCount : "--"}
          </span>
          <span className="bg-horde text-center" style={{ width: `${100 - allyPct}%` }}>
            {status.hordeCount !== null ? status.hordeCount : "--"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted">
          <span>联盟</span>
          <span data-testid="status-faction">
            {fmt(status.allianceCount)} : {fmt(status.hordeCount)}
          </span>
          <span>部落</span>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2.5 rounded-lg bg-panel-inset px-3 py-2">
        <span className="shrink-0 text-[13px] text-muted">当前阶段</span>
        {stage !== null && stageNodeId !== null ? (
          <Link
            href={`/progression#node-${stageNodeId}`}
            data-testid="status-stage"
            className="min-w-0 text-right text-sm font-medium leading-snug text-highlight hover:text-highlight-strong"
            title={stage}
          >
            {stage}
          </Link>
        ) : (
          <span
            data-testid="status-stage"
            className="min-w-0 text-right text-sm font-medium text-highlight"
          >
            待定
          </span>
        )}
      </div>

      <p className="mt-3 text-right text-xs text-muted">
        更新于 {formatTime(status.updatedAt)}
      </p>
    </section>
  );
}
