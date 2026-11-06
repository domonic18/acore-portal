"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FeaturedProduct = {
  slug: string;
  name: string;
  price: number;
  image: string | null;
};

/**
 * 精选商品轮播(lokta.cn「最新上架商品」对齐,2026-10):
 * 一件商品一屏——主图 + 底部渐变叠层(名称/积分),箭头/圆点手动切换,
 * 自动间隔复用首页轮播配置;无图落占位文案(存量商品缺图库时不破版)。
 */
export function HomeProductCarousel({
  products,
  intervalMs,
}: {
  products: FeaturedProduct[];
  intervalMs: number;
}) {
  const [index, setIndex] = useState(0);
  const count = products.length;

  useEffect(() => {
    if (count <= 1 || intervalMs <= 0) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(timer);
  }, [count, intervalMs]);

  if (count === 0) return null;
  const current = products[Math.min(index, count - 1)]!;

  return (
    <div>
      <div className="relative overflow-hidden rounded-xl border border-line">
        <Link
          href={`/shop/${encodeURIComponent(current.slug)}`}
          className="block"
          draggable={false}
        >
          <div className="relative aspect-[2/1] bg-panel-inset">
            {current.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.image}
                alt={current.name}
                loading="lazy"
                draggable={false}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-sm text-muted">
                暂无商品图
              </span>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-scrim/95 to-transparent px-3 pb-2.5 pt-10">
              <p className="line-clamp-1 text-[15px] font-medium text-heading">
                {current.name}
              </p>
              <p className="text-sm font-semibold text-highlight">{current.price} 积分</p>
            </div>
          </div>
        </Link>

        {count > 1 && (
          <>
            <button
              type="button"
              aria-label="上一件商品"
              onClick={() => setIndex((i) => (i - 1 + count) % count)}
              className="absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-scrim/80 text-base leading-none text-heading hover:bg-scrim"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="下一件商品"
              onClick={() => setIndex((i) => (i + 1) % count)}
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-scrim/80 text-base leading-none text-heading hover:bg-scrim"
            >
              ›
            </button>
          </>
        )}
      </div>

      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {products.map((p, i) => (
            <button
              key={p.slug}
              type="button"
              aria-label={`第 ${i + 1} 件商品`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === index ? "w-4 bg-accent" : "w-1.5 bg-dot hover:bg-dot-hover"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
