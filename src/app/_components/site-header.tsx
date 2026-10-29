import { cookies } from "next/headers";
import { SITE_NAV } from "@/constants/navigation";
import { SESSION } from "@/constants/session";
import { getSessionFromToken } from "@/lib/auth/session";
import { getRandomPortraitUrl } from "@/server/services/shared/portrait";
import { getBalance } from "@/server/services/points/ledger";
import { SiteHeaderClient } from "@/components/site/header-client";

/**
 * 全站页头(M3 US1 T018,R12;2026-10 设计稿对齐):服务端按登录态过滤 authOnly
 * 得双菜单(FR-201),登录态附积分余额 chip(设计稿 LoginMenu 口径),
 * 抽样随机角色头图(失败降级,FR-203),交互层 client 组件。
 */
export async function SiteHeader() {
  const token = (await cookies()).get(SESSION.ACCESS_COOKIE)?.value;
  const session = await getSessionFromToken(token).catch(() => null);
  const items = session ? SITE_NAV : SITE_NAV.filter((n) => !n.authOnly);
  const portraitUrl = await getRandomPortraitUrl();
  const points = session
    ? await getBalance(BigInt(session.userId)).catch(() => 0)
    : 0;

  return (
    <SiteHeaderClient
      items={items}
      portraitUrl={portraitUrl}
      authed={!!session}
      points={points}
    />
  );
}
