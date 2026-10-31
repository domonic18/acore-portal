"use client";

import { useEffect } from "react";

/**
 * Wowhead 物品浮窗(物品类商品详情):注入 power.js 对 wowhead 链接自动着色+浮窗;
 * 离线/被墙时脚本加载失败静默移除,降级为纯外链(Assumptions)。
 */
export function WowheadItemLink({ itemId }: { itemId: number }) {
  useEffect(() => {
    if (document.querySelector('script[data-wowhead-power]')) return;
    const script = document.createElement("script");
    script.src = "https://wow.zamimg.com/widgets/power/js/wow.js";
    script.async = true;
    script.dataset.wowheadPower = "1";
    script.onerror = () => script.remove();
    document.body.appendChild(script);
  }, []);

  return (
    <a
      href={`https://www.wowhead.com/item=${itemId}`}
      target="_blank"
      rel="noreferrer"
      className="text-sm text-blue-400 underline hover:text-blue-300"
    >
      查看 Wowhead 物品资料
    </a>
  );
}
