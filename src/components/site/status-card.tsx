"use client";

import { useEffect, useState } from "react";
import type { ServerStatusResult } from "@/lib/status-types";

/**
 * 首页服务器状态卡(US6/S6):SSR 初值 + 30s 轮询 /api/status。
 * enabled=false 整卡隐藏;degraded 挂「数据延迟」徽标并保留缓存值;
 * 冷启动失败数字字段 null 按 "--"/N/A 两态渲染(SC-208)。
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

  return (
    <section
      data-testid="home-server-status"
      className="rounded border border-[#1e2a3d] bg-[#0d1728] p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold text-[#e6d8a8]">服务器状态</h2>
        <div className="flex items-center gap-2">
          {status.maintenanceMode && (
            <span
              data-testid="status-maintenance"
              className="rounded bg-[#5d4a1e] px-2 py-0.5 text-xs text-[#e6d8a8]"
            >
              维护模式
            </span>
          )}
          {status.degraded && (
            <span
              data-testid="status-degraded"
              className="rounded bg-[#5d553a] px-2 py-0.5 text-xs text-[#e6d8a8]"
            >
              数据延迟
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-full ${
            status.online ? "bg-[#4ade80]" : "bg-[#f87171]"
          }`}
        />
        <span className="text-sm text-[#c7d2e0]">{status.online ? "在线" : "离线"}</span>
        <span className="text-sm text-[#8fa0b8]">
          <span data-testid="status-online-count" className="font-semibold text-[#e6d8a8]">
            {fmt(status.onlineCount)}
          </span>{" "}
          人在线
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">阵营比</dt>
          <dd data-testid="status-faction" className="text-[#c7d2e0]">
            {fmt(status.allianceCount)} : {fmt(status.hordeCount)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">登录队列</dt>
          <dd data-testid="status-queue" className="text-[#c7d2e0]">
            {status.queueCount === null ? "N/A" : status.queueCount}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">今日峰值</dt>
          <dd data-testid="status-peak" className="text-[#c7d2e0]">
            {fmt(status.todayPeak)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">稳定运行</dt>
          <dd data-testid="status-uptime" className="line-clamp-1 text-[#c7d2e0]">
            {status.uptimeText ?? "--"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">角色总数</dt>
          <dd data-testid="status-char-total" className="text-[#c7d2e0]">
            {fmt(status.charTotal)}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-[#5d6b80]">今日新注册</dt>
          <dd data-testid="status-new-chars" className="text-[#c7d2e0]">
            {fmt(status.todayNewChars)}
          </dd>
        </div>
      </dl>

      <p className="mt-3 border-t border-[#1e2a3d] pt-2 text-xs text-[#5d6b80]">
        当前阶段:<span className="text-[#8fa0b8]">{status.currentStage ?? "待定"}</span>
        <span className="ml-2" suppressHydrationWarning>
          更新于 {new Date(status.updatedAt).toLocaleTimeString("zh-CN", { hour12: false })}
        </span>
      </p>
    </section>
  );
}
