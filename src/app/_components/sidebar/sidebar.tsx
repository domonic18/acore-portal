import { SIDE_BY_PAGE_TYPE, type SitePageType } from "@/constants/content";
import { SIDEBAR_COMPONENTS } from "./registry";

/** 按页面类型渲染侧栏(R9,FR-206):清单=常量映射,空清单不占位;className 可覆写宽度 */
export function SiteSidebar({
  pageType,
  className = "lg:w-64",
}: {
  pageType: SitePageType;
  className?: string;
}) {
  const keys = SIDE_BY_PAGE_TYPE[pageType];
  if (keys.length === 0) return null;
  return (
    <aside
      data-testid="site-sidebar"
      className={`w-full space-y-4 lg:shrink-0 ${className}`}
    >
      {keys.map((key) => {
        const Component = SIDEBAR_COMPONENTS[key];
        return <Component key={key} />;
      })}
    </aside>
  );
}
