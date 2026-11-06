import type { TocItem } from "@/lib/markdown";

/**
 * 正文目录(2026-11-05 用户反馈重做):条目逐行垂直排列,长标题自然换行,
 * h3/h4 层级缩进。双形态同源数据:
 * - ArticleTocRail:xl+ 渲染在正文左侧,随页面滚动吸顶(88px 页头+间距),
 *   超长目录自身滚动;
 * - ArticleTocBlock:xl 以下回落文章顶部块(sm 起显示,移动端隐藏)。
 * 同一时刻仅一形态可见(display:none 不进无障碍树,目录 nav 查询不歧义)。
 * 目录有无由内容驱动:renderMarkdown 收 h2-h4 标题,无标题即整块不渲染。
 */

const HEADING_LABEL = (
  <p className="mb-3 flex items-center gap-2.5 text-[14px] font-semibold text-num">
    <span
      aria-hidden="true"
      className="h-[14px] w-[4px] shrink-0 rounded-full bg-accent"
    />
    目录
  </p>
);

function TocList({ items }: { items: TocItem[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
        <li key={item.id}>
          <a
            href={`#${item.id}`}
            className={`block break-words text-[13.5px] leading-relaxed text-body hover:text-link ${
              item.depth === 3 ? "pl-3" : item.depth === 4 ? "pl-6" : ""
            }`}
          >
            {item.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** 左侧跟随滚动目录列:作为三栏栅格首列,仅 xl+ 渲染;
 *  底色同 ContentPanel(页面背景图是全站装饰层,文字不可直压其上) */
export function ArticleTocRail({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="目录"
      data-testid="article-toc-rail"
      className="hidden xl:sticky xl:top-24 xl:block xl:max-h-[calc(100vh-7.5rem)] xl:self-start xl:overflow-y-auto xl:rounded-2xl xl:border xl:border-line xl:bg-panel-strong/95 xl:p-4"
    >
      {HEADING_LABEL}
      <TocList items={items} />
    </nav>
  );
}

/** 顶部目录块:xl 以下回落(sm 起显示),置于正文标题之下 */
export function ArticleTocBlock({ items }: { items: TocItem[] }) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="目录"
      data-testid="article-toc-top"
      className="mt-6 hidden rounded-xl border border-line bg-panel-inset p-5 sm:block xl:hidden"
    >
      {HEADING_LABEL}
      <TocList items={items} />
    </nav>
  );
}
