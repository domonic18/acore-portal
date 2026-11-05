import Link from "next/link";
import type { ServerStatusResult } from "@/lib/status-types";
import { ContentAsideCard } from "@/components/content/aside-card";

const fmt = (n: number | null) => (n === null ? "--" : String(n));

/** 在线人数卡(自文章页右栏 ArticleAside 移植,2026-11-05 并入侧栏内置组件):
 *  status.enabled=false(后台状态人工项关闭)或数据缺失时整卡不渲染 */
export function ServerStatusCard({ status }: { status: ServerStatusResult | null }) {
  if (!status || !status.enabled) return null;
  return (
    <ContentAsideCard title="在线人数" testId="sidebar-server-status">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[34px] font-bold leading-none text-[#a8d9f5]">
            {status.degraded ? "--" : fmt(status.onlineCount)}
          </div>
          <div className="mt-1.5 text-[12px] text-[#6482a3]">
            {status.degraded ? "数据延迟" : status.online ? "当前在线" : "服务器未响应"}
          </div>
        </div>
        <div className="text-right text-[12px] leading-6 text-[#6482a3]">
          <div>
            <span className="text-[#6fa3d6]">联盟</span> {fmt(status.allianceCount)}
          </div>
          <div>
            <span className="text-[#c96f66]">部落</span> {fmt(status.hordeCount)}
          </div>
        </div>
      </div>
      <Link
        href="/online-players"
        className="mt-3 inline-block text-[12px] text-[#6482a3] hover:text-[#6fb7e0]"
      >
        在线玩家 →
      </Link>
    </ContentAsideCard>
  );
}
