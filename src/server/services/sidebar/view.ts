import "server-only";
import { getConfig } from "@/lib/config";
import type { SitePageType, SidebarComponentKey } from "@/constants/content";
import type { SidebarCardConfig, SidebarNewsItem } from "@/constants/sidebar";
import type { ServerStatusResult } from "@/lib/status-types";
import { getServerSession } from "@/server/session-guard";
import { getBalance } from "@/server/services/shared/ledger";
import { getServerStatus } from "@/server/services/status/status";
import { listLatestNews } from "@/server/services/content/articles";
import { enabledSidebarComponents, listSidebarCards } from "./query";

export type SidebarView = {
  cards: SidebarCardConfig[];
  /** 本页命中的内置组件(注册表顺序;页面范围后台 /admin/sidebar 配置) */
  components: SidebarComponentKey[];
  balance: number | null;
  qqGroup: string;
  qqGroupQr: string;
  /** 在线人数卡数据(server-status 未启用时为 null,组件不渲染) */
  status: ServerStatusResult | null;
  /** 最新资讯卡数据(latest-news 未启用时为空数组) */
  latestNews: SidebarNewsItem[];
};

/**
 * 前台侧栏取数(R9):快捷卡与内置组件按页面类型过滤;组件专属数据
 * (在线人数/最新资讯)仅在对应组件本页启用时才取,不取无人展示的数据。
 * 积分余额仅登录态;QQ 交流群号/二维码来自 system_config(随设置保存热更新)。
 * 展示组件不直连 server/,取数由页面层经本服务完成。
 */
export async function getSidebarView(pageType: SitePageType): Promise<SidebarView> {
  const [cards, components, session, config] = await Promise.all([
    listSidebarCards(pageType),
    enabledSidebarComponents(pageType),
    getServerSession().catch(() => null),
    getConfig(),
  ]);
  const [balance, status, latestNews] = await Promise.all([
    session
      ? getBalance(BigInt(session.userId)).catch(() => 0)
      : Promise.resolve(null),
    components.includes("server-status")
      ? getServerStatus().catch(() => null)
      : Promise.resolve(null),
    components.includes("latest-news") ? listLatestNews(5) : Promise.resolve([]),
  ]);
  return {
    cards,
    components,
    balance,
    qqGroup: config.site.qqGroup,
    qqGroupQr: config.site.qqGroupQr,
    status,
    latestNews,
  };
}
