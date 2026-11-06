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
  /** 管理员:页头头像下拉给出「进入后台」快捷入口(#97) */
  isAdmin: boolean;
  points: number;
  logoUrl: string;
};

export type SiteFooterView = {
  icp: string | null;
  copyrightEn: string | null;
};

/** 全站页脚取数(FR-204):备案号与英文版权声明(留空不渲染) */
export async function getSiteFooterView(): Promise<SiteFooterView> {
  const site = await getConfig()
    .then((c) => c.site)
    .catch(() => null);
  return {
    icp: site?.icp || null,
    copyrightEn: site?.copyrightEn || null,
  };
}

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
    // 后台入口仅 admin 可见(/admin 由 requireAdmin 把关,moderator 不可达)
    isAdmin: session?.role === "admin",
    points,
    // 外观配置缺失(build 预渲染)时回落内置资源;页面背景与页头背景改由主题变量驱动
    logoUrl: appearance?.logoUrl || "/logo.png",
  };
}
