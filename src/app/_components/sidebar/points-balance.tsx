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
      <p className="text-[26px] font-bold leading-none text-[#e8c877]">{balance}</p>
      <Link
        href="/account/points"
        className="mt-2 inline-block text-[12px] text-[#93b2ce] hover:text-[#6fb7e0]"
      >
        积分明细 →
      </Link>
    </SidebarCard>
  );
}
