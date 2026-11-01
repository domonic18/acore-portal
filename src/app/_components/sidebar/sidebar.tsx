import { SIDE_BY_PAGE_TYPE, type SitePageType } from "@/constants/content";
import { listSidebarCards } from "@/server/services/sidebar/query";
import { SidebarQuickCards } from "@/components/site/sidebar/quick-cards";
import { SIDEBAR_COMPONENTS } from "./registry";

/**
 * 按页面类型渲染侧栏(R9,FR-206):快捷卡来自 sidebar_card 表(后台可配),
 * 固定组件来自注册表;两者都空则不占位。className 可覆写宽度。
 * sticky=true 时长栏随页面滚动吸顶(静态页快捷菜单;内容页右栏仅此一列时使用,
 * 与 ArticleAside 等已有吸顶侧栏同列会重叠,勿叠加)。
 */
export async function SiteSidebar({
  pageType,
  className = "lg:w-64",
  sticky = false,
}: {
  pageType: SitePageType;
  className?: string;
  sticky?: boolean;
}) {
  const [keys, cards] = await Promise.all([
    Promise.resolve(SIDE_BY_PAGE_TYPE[pageType]),
    listSidebarCards(pageType),
  ]);
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
        return <Component key={key} />;
      })}
    </aside>
  );
}
