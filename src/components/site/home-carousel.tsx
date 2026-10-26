"use client";

import { useEffect, useState } from "react";

/**
 * 首页轮播(US 首页轮播):物料由 /admin/home 配置,sort 升序;
 * 自动轮播 5s/张,悬停暂停;单张静态展示,空物料整块隐藏(父级短路)。
 * 初始固定第 0 张,水合后才开定时器——SSR/CSR 首帧一致,无 hydration 抖动。
 */
export function HomeCarousel({
  banners,
}: {
  banners: { id: string; title: string; imageUrl: string; linkUrl: string }[];
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = banners.length;

  useEffect(() => {
    if (paused || count <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [paused, count]);

  if (count === 0) return null;
  const current = banners[Math.min(index, count - 1)]!;

  return (
    <section
      className="md:col-span-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative overflow-hidden rounded border border-[#1e2a3d] bg-[#0d1728]">
        <a href={current.linkUrl || undefined} className="block" draggable={false}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={current.imageUrl}
            alt={current.title}
            className="h-56 w-full object-cover sm:h-64 md:h-72"
            draggable={false}
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-8 text-sm font-semibold text-[#e6d8a8]">
            {current.title}
          </span>
        </a>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="上一张"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-[#e6d8a8] hover:bg-black/70"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="下一张"
              onClick={() => setIndex((i) => (i + 1) % count)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-2 py-1 text-[#e6d8a8] hover:bg-black/70"
            >
              ›
            </button>
            <div className="absolute right-3 top-3 flex gap-1.5">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  aria-label={`第 ${i + 1} 张`}
                  onClick={() => setIndex(i)}
                  className={`h-2 w-2 rounded-full ${
                    i === index ? "bg-[#e6d8a8]" : "bg-white/40 hover:bg-white/70"
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
