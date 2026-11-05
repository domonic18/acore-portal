import type { ComponentType } from "react";
import type { SidebarComponentKey } from "@/constants/content";
import type { SidebarNewsItem } from "@/constants/sidebar";
import type { ServerStatusResult } from "@/lib/status-types";
import { QqGroup } from "./qq-group";
import { ServerStatusCard } from "./server-status-card";
import { LatestNewsCard } from "./latest-news-card";

/** 固定槽位入参:页面层取数后统一下发,组件保持无 IO(未启用组件的数据为 null/[]) */
export type SidebarSlotProps = {
  qqGroup: string;
  qqGroupQr: string;
  qqGroupJoinUrl: string;
  status: ServerStatusResult | null;
  latestNews: SidebarNewsItem[];
};

/** 侧栏固定组件注册表:键→组件(渲染顺序=SIDEBAR_COMPONENT_KEYS);
 * 各组件在哪些页面出现由 sidebar_component 表后台配置(行缺失回落代码缺省) */
export const SIDEBAR_COMPONENTS: Record<
  SidebarComponentKey,
  ComponentType<SidebarSlotProps>
> = {
  "server-status": ServerStatusCard,
  "latest-news": LatestNewsCard,
  "qq-group": QqGroup,
};
