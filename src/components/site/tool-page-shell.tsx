import Link from "next/link";
import {
  TOOL_DATABASE_TABS,
  type ToolPageView,
} from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";
import { ContentPanel } from "@/components/site/content-panel";

/**
 * 数据库工具页共用壳(2026-10 ardot p05 对齐):
 * 面包屑 + 大标题/iframe 来源 chip/副标 + 页内 tab + 浏览器框 iframe。
 * 三页(/hardcore、/online-players、/playermap)共用;iframe src/标题/外链契约不变。
 */
export function ToolPageShell({
  page,
  activePath,
}: {
  page: ToolPageView;
  activePath: string;
}) {
  const heading = page.heading ?? page.title;
  const urlLabel = page.iframeSrc.replace(/^https?:\/\//, "");

  return (
    <main className="container-site flex-1 py-6">
      {/* 标题区套内容面板:文字不再直接压在背景图上;iframe 源码串不外显 */}
      <ContentPanel className="px-4 py-3 lg:px-5 lg:py-4">
        <nav
          aria-label="面包屑"
          className="mb-2 flex items-center gap-2 text-[11px] lg:mb-3 lg:text-[13.5px]"
        >
          <Link href="/" className="text-muted hover:text-link">
            首页
          </Link>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
          <Link href="/hardcore" className="text-body hover:text-link">
            数据库
          </Link>
          <span aria-hidden="true" className="text-muted">
            ›
          </span>
          <span className="text-body lg:text-num">{heading}</span>
        </nav>

        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[18px] font-bold leading-tight text-num lg:text-[30px] lg:text-heading">
            {heading}
          </h1>
          {page.tagline && (
            <span className="text-[11px] text-muted lg:text-[13.5px]">
              {page.tagline}
            </span>
          )}
        </div>
      </ContentPanel>

      {page.tabs && (
        <nav
          aria-label="数据库工具切换"
          className="mt-3 flex items-center gap-1.5 rounded-xl border border-line bg-panel px-3 py-2 lg:mt-4 lg:gap-2.5 lg:px-4"
        >
          {TOOL_DATABASE_TABS.map((tab) => {
            const active = tab.path === activePath;
            return (
              <Link
                key={tab.path}
                href={tab.path}
                aria-current={active ? "page" : undefined}
                className={`rounded-full px-2.5 py-0.5 text-[10px] lg:rounded-lg lg:px-[18px] lg:py-2 lg:text-[14px] ${
                  active
                    ? "bg-link text-ink lg:bg-link/10 lg:text-num"
                    : "bg-panel-inset text-body hover:text-heading lg:bg-transparent"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      {page.notice && (
        <div className="mt-4 hidden items-start gap-3.5 rounded-xl bg-warn-soft/[0.08] px-5 py-3.5 lg:flex">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-warn-soft/[0.18] text-[17px] text-highlight">
            ⚠
          </span>
          <p className="text-[14.5px] leading-relaxed text-body">
            {page.notice}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-col overflow-hidden rounded-xl bg-surface-alt lg:mt-4 lg:rounded-[14px] lg:bg-panel-inset">
        <div className="flex h-[38px] items-center gap-2 bg-surface-alt px-2.5 lg:h-[46px] lg:gap-3 lg:bg-panel-inset lg:px-[18px]">
          <span className="flex shrink-0 items-center gap-[3px] lg:gap-[7px]">
            <span className="h-2 w-2 rounded-full bg-danger-strong lg:h-[11px] lg:w-[11px]" />
            <span className="h-2 w-2 rounded-full bg-warn lg:h-[11px] lg:w-[11px]" />
            <span className="h-2 w-2 rounded-full bg-ok lg:h-[11px] lg:w-[11px]" />
          </span>
          <div className="flex h-6 min-w-0 flex-1 items-center gap-2 rounded-md bg-deep px-2.5 lg:h-8 lg:gap-[9px] lg:rounded-lg lg:px-3.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok lg:h-2 lg:w-2" />
            <span className="truncate text-[11px] text-link lg:text-[13.5px]">
              {urlLabel}
            </span>
            {page.browserHint && (
              <span className="hidden shrink-0 text-[13px] text-muted lg:inline">
                {page.browserHint}
              </span>
            )}
          </div>
          <a
            href={page.iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="tools-open-external"
            className="shrink-0 rounded border border-line-muted px-2 py-1 text-[11px] text-body transition-colors hover:border-highlight-deep hover:text-highlight-soft lg:px-2.5 lg:text-xs"
          >
            新窗口打开 ↗
          </a>
        </div>
        <ToolsIframe
          src={page.iframeSrc}
          title={page.title}
          showExternal={false}
          heightClass="h-[calc(100dvh-9rem)] min-h-[600px] lg:min-h-[720px]"
        />
      </div>

      {page.notice && (
        <p className="mt-2.5 rounded-lg bg-warn/[0.08] px-2.5 py-2 text-[10px] leading-relaxed text-warn lg:hidden">
          ⚠ {page.notice}
        </p>
      )}
    </main>
  );
}
