import Link from "next/link";
import { listLatestAnnouncements } from "@/server/services/content/articles";
import { SidebarCard } from "@/components/site/sidebar/card";

/** 公告图链(R9):最新公告;图位=素材就绪前占位(替换 assets 即生效) */
export async function AnnouncementBanners() {
  const items = await listLatestAnnouncements(3).catch(() => []);
  return (
    <SidebarCard title="公告动态" testId="sidebar-announcement-banners">
      <div className="mb-2 rounded bg-[#16233a] p-3 text-center text-xs text-[#8fa0b8]">
        怀旧公益 · 60 时代 AzerothCore
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[#5d6b80]">暂无公告</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {items.map((a) => (
            <li key={a.slug}>
              <Link
                href={`/post/${encodeURIComponent(a.slug)}`}
                className="line-clamp-1 text-[#c7d2e0] hover:text-[#e6d8a8]"
              >
                {a.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SidebarCard>
  );
}
