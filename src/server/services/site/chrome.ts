import "server-only";
import { cookies } from "next/headers";
import { SITE_NAV, type SiteNavItem } from "@/constants/navigation";
import { SESSION } from "@/constants/session";
import { getSessionFromToken } from "@/lib/auth/session";
import { getConfig } from "@/lib/config";
import { getRandomPortraitUrl } from "@/server/services/shared/portrait";
import { getBalance } from "@/server/services/shared/ledger";

export type SiteHeaderView = {
  items: readonly SiteNavItem[];
  portraitUrl: string;
  authed: boolean;
  points: number;
  logoUrl: string;
  headerBackgroundUrl: string;
};

/**
 * 全站页头取数(FR-201/203/312 相关):按登录态过滤 authOnly 菜单、
 * 随机角色头图(失败降级)、积分 chip 与会话外观配置。交互在 header-client。
 */
export async function getSiteHeaderView(): Promise<SiteHeaderView> {
  const token = cookies().get(SESSION.ACCESS_COOKIE)?.value;
  const session = await getSessionFromToken(token).catch(() => null);
  const [portraitUrl, points, appearance] = await Promise.all([
    getRandomPortraitUrl(),
    session ? getBalance(BigInt(session.userId)).catch(() => 0) : 0,
    getConfig()
      .then((c) => c.appearance)
      .catch(() => null),
  ]);
  return {
    items: session ? SITE_NAV : SITE_NAV.filter((n) => !n.authOnly),
    portraitUrl,
    authed: !!session,
    points,
    // 外观配置缺失(build 预渲染)时回落内置资源;显式留空=不渲染背景图
    logoUrl: appearance?.logoUrl || "/logo.png",
    headerBackgroundUrl: appearance?.headerBackgroundUrl ?? "/background.jpg",
  };
}
