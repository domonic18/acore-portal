import { SIDE_BY_PAGE_TYPE, type SitePageType } from "@/constants/content";
import type { SidebarCardConfig } from "@/constants/sidebar";
import { SidebarQuickCards } from "./quick-cards";
import { SIDEBAR_COMPONENTS } from "./registry";

/**
 * 按页面类型渲染侧栏(R9,FR-206):数据由页面层经 getSidebarView 取好后传入,
 * 固定组件来自注册表;两者都空则不占位。className 可覆写宽度。
 * sticky=true 时长栏随页面滚动吸顶(静态页快捷菜单;内容页右栏仅此一列时使用,
 * 与 ArticleAside 等已有吸顶侧栏同列会重叠,勿叠加)。
 */
export function SiteSidebar({
  pageType,
  cards,
  balance,
  className = "lg:w-64",
  sticky = false,
}: {
  pageType: SitePageType;
  cards: SidebarCardConfig[];
  balance: number | null;
  className?: string;
  sticky?: boolean;
}) {
  const keys = SIDE_BY_PAGE_TYPE[pageType];
  if (keys.length === 0 && cards.length === 0) return null;

  return (
    <aside
      data-testid="site-sidebar"
      className={`w-full space-y-4 lg:shrink-0 ${
        sticky ? "lg:sticky lg:top-20 lg:self-start" : ""
      } ${className}`}
    >
      <SidebarQuickCards cards={cards} />
      {keys.map((key) => {
        const Component = SIDEBAR_COMPONENTS[key];
        return <Component key={key} balance={balance} />;
      })}
    </aside>
  );
}
