import Link from "next/link";
import {
  TOOL_DATABASE_TABS,
  type ToolPageMeta,
} from "@/constants/tools";
import { ToolsIframe } from "@/components/site/tools-iframe";

/**
 * 数据库工具页共用壳(2026-10 ardot p05 对齐):
 * 面包屑 + 大标题/iframe 来源 chip/副标 + 页内 tab + 浏览器框 iframe。
 * 三页(/hardcore、/online-players、/playermap)共用;iframe src/标题/外链契约不变。
 */
export function ToolPageShell({
  page,
  activePath,
}: {
  page: ToolPageMeta;
  activePath: string;
}) {
  const heading = page.heading ?? page.title;
  const urlLabel = page.iframeSrc.replace(/^https?:\/\//, "");
  const chipSrc = page.chipLabel ?? page.iframeSrc;
  // 设计稿 iframe 区填满首屏:按标题/tab/提示条占位差补高度
  const desktopHeight = page.notice
    ? "lg:h-[calc(100vh-20rem)]"
    : page.tabs
      ? "lg:h-[calc(100vh-18.5rem)]"
      : "lg:h-[calc(100vh-15.25rem)]";

  return (
    <main className="container-site flex-1 py-6">
      <nav
        aria-label="面包屑"
        className="mb-4 flex items-center gap-2 text-[11px] lg:text-[13.5px]"
      >
        <Link href="/" className="text-[#6482a3] hover:text-[#6fb7e0]">
          首页
        </Link>
        <span aria-hidden="true" className="text-[#6482a3]">
          ›
        </span>
        <Link href="/hardcore" className="text-[#93b2ce] hover:text-[#6fb7e0]">
          数据库
        </Link>
        <span aria-hidden="true" className="text-[#6482a3]">
          ›
        </span>
        <span className="text-[#93b2ce] lg:text-[#a8d9f5]">{heading}</span>
      </nav>

      <div className="flex flex-wrap items-center gap-3 lg:gap-3.5">
        <h1 className="text-[18px] font-bold leading-tight text-[#a8d9f5] lg:text-[30px] lg:text-[#dcebf7]">
          {heading}
        </h1>
        <span className="hidden items-center gap-2 rounded-[7px] bg-[#6fb7e0]/[0.07] px-3 py-1.5 text-[13px] lg:inline-flex">
          <span className="font-bold text-[#e8c877]">{"</>"}</span>
          <span className="text-[#6fb7e0]">{`iframe src="${chipSrc}"`}</span>
        </span>
        {page.tagline && (
          <span className="hidden text-[13.5px] text-[#6482a3] lg:inline">
            {page.tagline}
          </span>
        )}
      </div>
      {/* 移动端设计稿:来源与副标合并为单行 */}
      {page.tagline && (
        <p className="mt-1 text-[10px] text-[#6482a3] lg:hidden">
          {`iframe src="${chipSrc}"`} · {page.tagline}
        </p>
      )}

      {page.tabs && (
        <nav
          aria-label="数据库工具切换"
          className="mt-3 flex items-center gap-1.5 lg:mt-4 lg:gap-2.5"
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
                    ? "bg-[#6fb7e0] text-[#06121f] lg:bg-[#6fb7e0]/10 lg:text-[#a8d9f5]"
                    : "bg-[#0d1828] text-[#93b2ce] hover:text-[#dcebf7] lg:bg-transparent"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      )}

      {page.notice && (
        <div className="mt-4 hidden items-start gap-3.5 rounded-xl bg-[#c49a4a]/[0.08] px-5 py-3.5 lg:flex">
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg bg-[#c49a4a]/[0.18] text-[17px] text-[#e8c877]">
            ⚠
          </span>
          <p className="text-[14.5px] leading-relaxed text-[#93b2ce]">
            {page.notice}
          </p>
        </div>
      )}

      <div className="mt-3 flex flex-col overflow-hidden rounded-xl bg-[#1b2f4c] lg:mt-4 lg:rounded-[14px] lg:bg-[#0d1828]">
        <div className="flex h-[38px] items-center gap-2 bg-[#1b2f4c] px-2.5 lg:h-[46px] lg:gap-3 lg:bg-[#0b1524] lg:px-[18px]">
          <span className="flex shrink-0 items-center gap-[3px] lg:gap-[7px]">
            <span className="h-2 w-2 rounded-full bg-[#e06a6a] lg:h-[11px] lg:w-[11px]" />
            <span className="h-2 w-2 rounded-full bg-[#e0a94e] lg:h-[11px] lg:w-[11px]" />
            <span className="h-2 w-2 rounded-full bg-[#57b87d] lg:h-[11px] lg:w-[11px]" />
          </span>
          <div className="flex h-6 min-w-0 flex-1 items-center gap-2 rounded-md bg-[#060d18] px-2.5 lg:h-8 lg:gap-[9px] lg:rounded-lg lg:px-3.5">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#57b87d] lg:h-2 lg:w-2" />
            <span className="truncate text-[11px] text-[#6fb7e0] lg:text-[13.5px]">
              {urlLabel}
            </span>
            {page.browserHint && (
              <span className="hidden shrink-0 text-[13px] text-[#6482a3] lg:inline">
                {page.browserHint}
              </span>
            )}
          </div>
          <a
            href={page.iframeSrc}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="tools-open-external"
            className="shrink-0 rounded border border-[#243350] px-2 py-1 text-[11px] text-[#93b2ce] transition-colors hover:border-[#c9a227] hover:text-[#e6d8a8] lg:px-2.5 lg:text-xs"
          >
            新窗口打开 ↗
          </a>
        </div>
        <ToolsIframe
          src={page.iframeSrc}
          title={page.title}
          showExternal={false}
          heightClass={`h-[calc(100vh-17rem)] min-h-[360px] lg:min-h-[480px] ${desktopHeight}`}
        />
      </div>

      {page.notice && (
        <p className="mt-2.5 rounded-lg bg-[#e0a94e]/[0.08] px-2.5 py-2 text-[10px] leading-relaxed text-[#e0a94e] lg:hidden">
          ⚠ {page.notice}
        </p>
      )}
    </main>
  );
}
