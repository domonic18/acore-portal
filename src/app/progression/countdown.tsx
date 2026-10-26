"use client";

import { useEffect, useState } from "react";

/**
 * 下一阶段倒计时(复刻旧站 page 2796 行为):每秒刷新,
 * 到点显示"倒计时已经结束,对应阶段已开放";挂载后才渲染数值避免 hydration 漂移。
 */
export function ProgressionCountdown({ targetIso }: { targetIso: string | null }) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!targetIso || now === null) return null;
  const distance = Date.parse(targetIso) - now;
  let text: string;
  if (distance <= 0) {
    text = "倒计时已经结束,对应阶段已开放";
  } else {
    const days = Math.floor(distance / 86_400_000);
    const hours = Math.floor((distance % 86_400_000) / 3_600_000);
    const minutes = Math.floor((distance % 3_600_000) / 60_000);
    const seconds = Math.floor((distance % 60_000) / 1000);
    text = `还有 ${days}天 ${hours}小时 ${minutes}分钟 ${seconds}秒`;
  }
  return (
    <h2
      data-testid="progression-countdown"
      className="text-center text-lg font-bold text-[#e6d8a8]"
    >
      {text}
    </h2>
  );
}
