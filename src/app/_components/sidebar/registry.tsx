import type { ComponentType } from "react";
import type { SidebarComponentKey } from "@/constants/content";
import { PointsBalance } from "./points-balance";
import {
  AddonDownload,
  ClientDownload,
  LauncherDownload,
  YyChannel,
} from "@/components/site/sidebar/download-cards";

/** 侧栏组件注册表(R9):键→组件;清单由 SIDE_BY_PAGE_TYPE 按页面类型编排 */
export const SIDEBAR_COMPONENTS: Record<
  SidebarComponentKey,
  ComponentType
> = {
  "client-download": ClientDownload,
  "launcher-download": LauncherDownload,
  "yy-channel": YyChannel,
  "addon-download": AddonDownload,
  "points-balance": PointsBalance,
};
