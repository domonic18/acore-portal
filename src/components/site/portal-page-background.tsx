"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * 页面背景图层与路由绑定(2026-11-08 性能):
 * 后台是独立控制台,不显示门户的装饰性大图(实测 background.jpg 244KB/页)。
 *
 * 服务端已在 /admin* 请求省掉该图层(根布局读 middleware 打的标记),
 * 直开后台时浏览器不会去下载那张图。本组件负责客户端导航时的补齐:
 * 根布局在同层路由间不重渲染,后台 → 门户的客户端跳转需由这里把背景恢复。
 */
export function PortalPageBackground({ pageBackground }: { pageBackground: string }) {
  const pathname = usePathname();

  useEffect(() => {
    const isAdmin = pathname?.startsWith("/admin") ?? false;
    document.documentElement.style.setProperty(
      "--theme-page-background",
      isAdmin ? "none" : pageBackground,
    );
  }, [pathname, pageBackground]);

  return null;
}
