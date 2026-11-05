import type { SitePageType, SidebarComponentKey } from "@/constants/content";
import type { SidebarCardConfig, SidebarNewsItem } from "@/constants/sidebar";
import type { ServerStatusResult } from "@/lib/status-types";
import { SidebarQuickCards } from "./quick-cards";
import { SIDEBAR_COMPONENTS } from "./registry";

/**
 * 按页面类型渲染侧栏(R9,FR-206):数据由页面层经 getSidebarView 取好后传入,
 * 快捷卡+内置组件(components 由 sidebar_component 表后台按页面类型编排);
 * 两者都空则不占位。className 可覆写宽度。sticky=true 时长栏随页面滚动吸顶
 * (88px 页头+间距;右栏仅此一列时使用)。
 */
export function SiteSidebar({
  pageType,
  cards,
  components,
  balance,
  qqGroup,
  qqGroupQr,
  status,
  latestNews,
  className = "lg:w-64",
  sticky = false,
}: {
  pageType: SitePageType;
  cards: SidebarCardConfig[];
  components: SidebarComponentKey[];
  balance: number | null;
  qqGroup: string;
  qqGroupQr: string;
  status: ServerStatusResult | null;
  latestNews: SidebarNewsItem[];
  className?: string;
  sticky?: boolean;
}) {
  if (components.length === 0 && cards.length === 0) return null;

  return (
    <aside
      data-testid="site-sidebar"
      className={`w-full space-y-4 lg:shrink-0 ${
        sticky ? "lg:sticky lg:top-24 lg:self-start" : ""
      } ${className}`}
    >
      <SidebarQuickCards cards={cards} />
      {components.map((key) => {
        const Component = SIDEBAR_COMPONENTS[key];
        return (
          <Component
            key={key}
            balance={balance}
            qqGroup={qqGroup}
            qqGroupQr={qqGroupQr}
            status={status}
            latestNews={latestNews}
          />
        );
      })}
    </aside>
  );
}
