import "server-only";
import type { SitePageType } from "@/constants/content";
import type { SidebarCardConfig } from "@/constants/sidebar";
import { getServerSession } from "@/server/session-guard";
import { getBalance } from "@/server/services/shared/ledger";
import { listSidebarCards } from "./query";

export type SidebarView = {
  cards: SidebarCardConfig[];
  balance: number | null;
};

/**
 * 前台侧栏取数(R9):快捷卡按页面类型过滤,积分余额仅登录态。
 * 展示组件不直连 server/,取数由页面层经本服务完成。
 */
export async function getSidebarView(pageType: SitePageType): Promise<SidebarView> {
  const [cards, session] = await Promise.all([
    listSidebarCards(pageType),
    getServerSession().catch(() => null),
  ]);
  const balance = session
    ? await getBalance(BigInt(session.userId)).catch(() => 0)
    : null;
  return { cards, balance };
}
