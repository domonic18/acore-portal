import Link from "next/link";
import { SidebarCard } from "./card";

/** 积分余额(R9):登录态才渲染(balance 为 null 表示游客) */
export function PointsBalance({ balance }: { balance: number | null }) {
  if (balance === null) return null;
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
