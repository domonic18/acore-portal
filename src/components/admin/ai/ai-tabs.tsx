"use client";
/**
 * 后台「AI 管理」Tab 栏(2026-11-18 用户反馈:AI 模型/用量/对话三菜单合并
 * 为单入口 /admin/ai,页内 Tab 切换,收敛后台菜单长度)。
 * active 由 pathname 判定;后台内链一律 prefetch={false}(规则 9)。
 */
import Link from "next/link";
import { usePathname } from "next/navigation";

const AI_TABS = [
  { href: "/admin/ai/models", label: "模型" },
  { href: "/admin/ai/usage", label: "用量" },
  { href: "/admin/ai/sessions", label: "对话" },
] as const;

export function AiTabs() {
  const pathname = usePathname();
  return (
    <div
      role="tablist"
      aria-label="AI 管理分区"
      className="flex gap-1 border-b border-line"
    >
      {AI_TABS.map((t) => {
        const active = pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            prefetch={false}
            role="tab"
            aria-selected={active}
            data-testid={`ai-tab-${t.label}`}
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
