import Link from "next/link";
import { ARCHIVE_ASIDE_LINKS, ARCHIVE_COMMON_LINKS } from "@/constants/content";
import { ContentAsideCard } from "@/components/content/aside-card";

/** 归档页右栏(p04):快捷入口 / 常用功能 / 热门资讯 */
export function ArchiveAside({
  hot,
}: {
  hot: { slug: string; title: string; views: number }[];
}) {
  return (
    <aside className="space-y-5 lg:sticky lg:top-20">
      <ContentAsideCard title="快捷入口">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {ARCHIVE_ASIDE_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[14px] text-[#93b2ce] hover:text-[#6fb7e0]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </ContentAsideCard>

      <ContentAsideCard title="常用功能">
        <ul className="divide-y divide-[#21385a]">
          {ARCHIVE_COMMON_LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                className="flex items-center justify-between py-2.5 text-[14px] text-[#93b2ce] hover:text-[#6fb7e0]"
              >
                {l.label}
                <span aria-hidden="true" className="text-[12px] text-[#6482a3]">
                  →
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </ContentAsideCard>

      <ContentAsideCard title="热门资讯">
        {hot.length === 0 ? (
          <p className="text-[13px] text-[#6482a3]">暂无资讯</p>
        ) : (
          <ul className="divide-y divide-[#21385a]">
            {hot.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/post/${encodeURIComponent(a.slug)}`}
                  className="flex items-baseline justify-between gap-3 py-2.5 text-[14px] text-[#93b2ce] hover:text-[#6fb7e0]"
                >
                  <span className="line-clamp-1">{a.title}</span>
                  <span className="shrink-0 text-[12px] text-[#6482a3]">
                    {a.views} 阅读
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
    </aside>
  );
}
