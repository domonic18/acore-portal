import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION } from "@/constants/session";
import { getSessionFromToken } from "@/lib/auth/session";
import { getBalance } from "@/server/services/points/ledger";
import { SidebarCard } from "@/components/site/sidebar/card";

/** 积分余额(R9):登录态才渲染,游客返回 null */
export async function PointsBalance() {
  const token = (await cookies()).get(SESSION.ACCESS_COOKIE)?.value;
  const session = await getSessionFromToken(token).catch(() => null);
  if (!session) return null;
  const balance = await getBalance(BigInt(session.userId)).catch(() => 0);
  return (
    <SidebarCard title="我的积分" testId="sidebar-points-balance">
      <p className="text-lg font-semibold text-[#e6d8a8]">{balance}</p>
      <Link
        href="/account/points"
        className="mt-1 inline-block text-xs text-[#8fa0b8] hover:text-[#e6d8a8]"
      >
        积分明细 →
      </Link>
    </SidebarCard>
  );
}
