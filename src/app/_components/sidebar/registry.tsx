import type { ComponentType } from "react";
import type { SidebarComponentKey } from "@/constants/content";
import { PointsBalance } from "./points-balance";

/** 侧栏固定组件注册表:键→组件;清单由 SIDE_BY_PAGE_TYPE 按页面类型编排 */
export const SIDEBAR_COMPONENTS: Record<
  SidebarComponentKey,
  ComponentType
> = {
  "points-balance": PointsBalance,
};
