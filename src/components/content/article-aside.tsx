import Link from "next/link";
import type { ServerStatusResult } from "@/lib/status-types";
import { ContentAsideCard } from "@/components/content/aside-card";

const fmt = (n: number | null) => (n === null ? "--" : String(n));

/** 文章详情右栏(p04):最新资讯 / 在线人数 / 公告推送说明 */
export function ArticleAside({
  latest,
  status,
  isAnnouncement,
}: {
  latest: { slug: string; title: string; publishedAt: Date | null }[];
  status: ServerStatusResult;
  isAnnouncement: boolean;
}) {
  return (
    <aside className="space-y-5 lg:sticky lg:top-20">
      {status.enabled && (
        <ContentAsideCard title="在线人数">
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
      )}

      <ContentAsideCard title="最新资讯">
        {latest.length === 0 ? (
          <p className="text-[13px] text-[#6482a3]">暂无资讯</p>
        ) : (
          <ul className="divide-y divide-[#21385a]">
            {latest.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/post/${encodeURIComponent(a.slug)}`}
                  className="flex items-baseline justify-between gap-3 py-2.5 text-[14px] text-[#93b2ce] hover:text-[#6fb7e0]"
                >
                  <span className="line-clamp-1">{a.title}</span>
                  <span className="shrink-0 text-[12px] text-[#6482a3]">
                    {a.publishedAt?.toISOString().slice(0, 10)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href="/news"
          className="mt-2 inline-block text-[12px] text-[#6482a3] hover:text-[#6fb7e0]"
        >
          全部资讯 →
        </Link>
      </ContentAsideCard>

      {isAnnouncement && (
        <ContentAsideCard title="公告通知">
          <p className="text-[13px] leading-6 text-[#93b2ce]">
            公告发布后自动推送至站内信,可在通知中心查看。
          </p>
          <Link
            href="/account/notifications"
            className="mt-2 inline-block text-[12px] text-[#6482a3] hover:text-[#6fb7e0]"
          >
            查看通知中心 →
          </Link>
        </ContentAsideCard>
      )}
    </aside>
  );
}
