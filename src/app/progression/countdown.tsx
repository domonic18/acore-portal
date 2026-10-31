"use client";

import { useEffect, useState } from "react";

/**
 * 下一阶段倒计时(p02 设计稿四格样式):每秒刷新;挂载后才渲染真实数值
 * 避免 hydration 漂移,挂载前显示占位。到点提示对应阶段已开放。
 */
export function ProgressionCountdown({ targetIso }: { targetIso: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!targetIso) return null;

  const distance = now === null ? null : Date.parse(targetIso) - now;
  if (distance !== null && distance <= 0) {
    return (
      <p
        data-testid="progression-countdown"
        className="text-[13px] text-[#8ad896]"
      >
        倒计时已经结束，对应阶段已开放
      </p>
    );
  }

  const total = distance ?? 0;
  const units = [
    { label: "天", value: Math.floor(total / 86_400_000) },
    { label: "时", value: Math.floor((total % 86_400_000) / 3_600_000) },
    { label: "分", value: Math.floor((total % 3_600_000) / 60_000) },
    { label: "秒", value: Math.floor((total % 60_000) / 1000) },
  ];

  return (
    <div
      data-testid="progression-countdown"
      className="flex items-end gap-2"
      aria-label="下一阶段开放倒计时"
    >
      {units.map((u) => (
        <div key={u.label} className="flex flex-col items-center gap-1.5">
          <span className="flex h-[54px] w-[62px] items-center justify-center rounded-lg border border-[#22385a] bg-[#0a1220] text-[24px] font-semibold tabular-nums text-[#a8d9f5]">
            {distance === null ? "--" : String(u.value).padStart(2, "0")}
          </span>
          <span className="text-[10px] text-[#93b2ce]">{u.label}</span>
        </div>
      ))}
    </div>
  );
}
