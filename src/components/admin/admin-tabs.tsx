"use client";
/**
 * 后台通用 Tab 栏(2026-11-18 用户反馈:菜单收敛——功能相近的页面合并为
 * 单入口页内 Tab;AI 管理为首个使用者,其后看板/商品/内容/首页配置/设置):
 * active 按「最长前缀匹配」判定(子路由 Tab 与父路径 Tab 嵌套时不误亮)。
 * 后台内链一律 prefetch={false}(规则 9)。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

export type AdminTabItem = { href: string; label: string };

export function AdminTabs({
  items,
  ariaLabel,
}: {
  items: readonly AdminTabItem[];
  ariaLabel: string;
}) {
  const pathname = usePathname();
  const best = items
    .filter((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1 border-b border-line">
      {items.map((t) => {
        const active = t.href === best;
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            data-testid={`admin-tab-${t.label}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-highlight text-highlight"
                : "border-transparent text-muted hover:text-heading"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
