"use client";

import { useState } from "react";

/**
 * 商品图库(WP featured image 对齐):首图=主图,多图缩略条切换;
 * 无图回退类型图标占位;主图点击新窗看原图(图片加载失败兜底占位,需求池 P1)。
 */
export function ProductGallery({
  images,
  alt,
  fallbackIcon,
}: {
  images: string[];
  alt: string;
  fallbackIcon: string;
}) {
  const [idx, setIdx] = useState(0);
  const [broken, setBroken] = useState<Record<string, boolean>>({});

  const main = images[idx] ?? images[0];
  if (images.length === 0 || !main || broken[main]) {
    return (
      <div
        aria-hidden
        className="flex h-64 items-center justify-center rounded border border-gray-800 bg-gradient-to-br from-indigo-950 to-gray-900 text-7xl"
      >
        {fallbackIcon}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-testid="product-gallery">
      <a href={main} target="_blank" rel="noopener noreferrer" draggable={false}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={main}
          alt={alt}
          draggable={false}
          onError={() => setBroken((prev) => ({ ...prev, [main]: true }))}
          className="h-64 w-full rounded border border-gray-800 bg-gradient-to-br from-indigo-950 to-gray-900 object-contain"
        />
      </a>
      {images.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {images.map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`查看第 ${i + 1} 张图片`}
              aria-current={i === idx}
              className={`h-14 w-14 overflow-hidden rounded border ${
                i === idx ? "border-amber-400" : "border-gray-700"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={src}
                alt=""
                loading="lazy"
                draggable={false}
                onError={(e) => {
                  e.currentTarget.parentElement?.remove();
                }}
                className="h-full w-full object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
