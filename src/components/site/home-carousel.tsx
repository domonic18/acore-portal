"use client";

import { useEffect, useState } from "react";

/**
 * 首页轮播(US 首页轮播;2026-10 ardot 设计稿 p01-s1 对齐):
 * 左下角标题叠层(深色块)+ 圆形箭头 + 右下长条圆点;物料由 /admin/home 配置。
 * 自动轮播间隔由后台配置(carouselIntervalSec→intervalMs);不做悬停暂停
 * (悬停即静默停转,前台无从得知曾被误读为"不轮播"),手动切换走箭头/圆点。
 * 单张静态展示,空物料整块隐藏(父级短路);初始固定第 0 张,水合后才开定时器。
 */
export function HomeCarousel({
  banners,
  intervalMs,
}: {
  banners: { id: string; title: string; imageUrl: string; linkUrl: string }[];
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1 || intervalMs <= 0) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, intervalMs]);

  if (count === 0) return null;
  const current = banners[Math.min(index, count - 1)]!;

  return (
    <section
      aria-label="首页轮播"
      className="relative overflow-hidden rounded-2xl border border-[#35577f] bg-[#13233a]"
    >
      <a href={current.linkUrl || undefined} className="block" draggable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.imageUrl}
          alt={current.title}
          className="aspect-[8/3] max-h-[462px] w-full object-cover"
          draggable={false}
        />
      </a>

      {/* 左下标题叠层 */}
      <div className="pointer-events-none absolute bottom-0 left-0 max-w-[85%] rounded-tr-2xl bg-[#050a12]/85 px-5 py-4">
        <h2 className="text-xl font-bold leading-snug text-white sm:text-2xl lg:text-[28px]">
          {current.title}
        </h2>
      </div>

      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="上一张"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#050a12]/80 text-xl leading-none text-[#dcebf7] hover:bg-[#050a12]"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label="下一张"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-4 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-[#050a12]/80 text-xl leading-none text-[#dcebf7] hover:bg-[#050a12]"
          >
            ›
          </button>
          <div className="absolute bottom-4 right-5 flex items-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`第 ${i + 1} 张`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index
                    ? "w-5 bg-[#5ea3cc]"
                    : "w-2 bg-[#6382a3] hover:bg-[#8aa7c4]"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
