"use client";

import { Toaster as SonnerToaster } from "sonner";

/** 全站 toast(sonner):配色经 sonner 主题变量映射到语义令牌,双主题/admin 作用域自动跟随 */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      style={{
        "--normal-bg": "var(--popover)",
        "--normal-text": "var(--foreground)",
        "--normal-border": "var(--border)",
        "--border-radius": "var(--radius-overlay)",
      } as React.CSSProperties}
      toastOptions={{
        classNames: {
          toast: "!shadow-pop !text-[13px]",
          title: "!text-heading !font-semibold",
          description: "!text-body",
        },
      }}
    />
  );
}
