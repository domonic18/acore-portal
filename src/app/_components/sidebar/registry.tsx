import type { ComponentType } from "react";
import type { SidebarComponentKey } from "@/constants/content";
import { AnnouncementBanners } from "./announcement-banners";
import { CalendarArchive } from "./calendar-archive";
import { PointsBalance } from "./points-balance";
import {
  AddonDownload,
  ClientDownload,
  LauncherDownload,
  YyChannel,
} from "@/components/site/sidebar/download-cards";
import { ExternalLinks } from "@/components/site/sidebar/external-links";
import { RecentProducts } from "@/components/site/sidebar/recent-products";
import { SearchBox } from "@/components/site/sidebar/search-box";

/** 侧栏组件注册表(R9):键→组件;清单由 SIDE_BY_PAGE_TYPE 按页面类型编排 */
export const SIDEBAR_COMPONENTS: Record<
  SidebarComponentKey,
  ComponentType
> = {
  search: SearchBox,
  "announcement-banners": AnnouncementBanners,
  "client-download": ClientDownload,
  "launcher-download": LauncherDownload,
  "yy-channel": YyChannel,
  "external-links": ExternalLinks,
  "addon-download": AddonDownload,
  "calendar-archive": CalendarArchive,
  "points-balance": PointsBalance,
  "recent-products": RecentProducts,
};
