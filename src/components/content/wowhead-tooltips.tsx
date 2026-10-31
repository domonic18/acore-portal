"use client";

import { useEffect } from "react";

/** 正文 Wowhead 浮窗:注入 power.js 对 wowhead 链接自动浮窗;加载失败静默降级纯外链 */
export function WowheadTooltips() {
  useEffect(() => {
    if (document.querySelector("script[data-wowhead-power]")) return;
    const script = document.createElement("script");
    script.src = "https://wow.zamimg.com/widgets/power/js/wow.js";
    script.async = true;
    script.dataset.wowheadPower = "1";
    script.onerror = () => script.remove();
    document.body.appendChild(script);
  }, []);
  return null;
}
