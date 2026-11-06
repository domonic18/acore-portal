import Link from "next/link";
import type { SiteMapGroup } from "@/constants/content";

/**
 * /sitemap 分组链接区(前台页面与后台预览共用;纯展示无 IO)。
 * 前台由 getSiteMapPageView() 供数,后台静态页编辑器用它预览系统生成内容
 * (issue #94:编辑器只暴露 body_md 会与前台显示割裂)。
 */
export function SiteMapSection({ groups }: { groups: SiteMapGroup[] }) {
  return (
    <section
      aria-label="站点地图"
      data-testid="sitemap-groups"
      className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {groups.map((group) => (
        <div
          key={group.name}
          className="rounded-xl border border-line bg-panel/60 p-4"
        >
          <h2 className="border-l-[3px] border-accent pl-2.5 text-[16px] font-bold text-heading">
            {group.name}
          </h2>
          <ul className="mt-3 space-y-2 text-[14px]">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-link hover:text-highlight"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
