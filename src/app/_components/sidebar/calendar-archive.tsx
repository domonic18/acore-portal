import Link from "next/link";
import { ARCHIVE_CATEGORIES } from "@/constants/content";
import { archiveMonthCounts } from "@/server/services/content/articles";
import { SidebarCard } from "@/components/site/sidebar/card";

/** 日历归档(R9):归档入口+月度计数(近 6 个月) */
export async function CalendarArchive() {
  const months = await archiveMonthCounts().catch(() => []);
  return (
    <SidebarCard title="日历归档" testId="sidebar-calendar-archive">
      <ul className="mb-3 space-y-1.5 text-xs">
        {ARCHIVE_CATEGORIES.map((c) => (
          <li key={c.slug}>
            <Link
              href={`/${c.slug}`}
              className="text-[#c7d2e0] hover:text-[#e6d8a8]"
            >
              {c.name}
            </Link>
          </li>
        ))}
      </ul>
      {months.length > 0 && (
        <ul className="space-y-1 border-t border-[#1e2a3d] pt-2 text-xs text-[#8fa0b8]">
          {months.map((m) => (
            <li key={m.month} className="flex justify-between">
              <span>{m.month}</span>
              <span>({m.count})</span>
            </li>
          ))}
        </ul>
      )}
    </SidebarCard>
  );
}
