import Link from "next/link";
import type { SidebarNewsItem } from "@/constants/sidebar";
import { ContentAsideCard } from "@/components/content/aside-card";

/** 最新资讯卡(自文章页右栏 ArticleAside 移植,2026-11-05 并入侧栏内置组件):
 *  数据由 getSidebarView 在 latest-news 组件本页启用时取好下发 */
export function LatestNewsCard({ latestNews }: { latestNews: SidebarNewsItem[] }) {
  return (
    <ContentAsideCard title="最新资讯" testId="sidebar-latest-news">
      {latestNews.length === 0 ? (
        <p className="text-[13px] text-[#6482a3]">暂无资讯</p>
      ) : (
        <ul className="divide-y divide-[#21385a]">
          {latestNews.map((a) => (
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
  );
}
