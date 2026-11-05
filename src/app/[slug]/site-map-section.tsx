import Link from "next/link";
import type { SiteMapGroup } from "@/server/services/seo/sitemap";

/** /sitemap 分组链接区(页面私有组件,与 [slug]/page 同目录;纯展示无 IO) */
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
          className="rounded-xl border border-[#22385a] bg-[#13233a]/60 p-4"
        >
          <h2 className="border-l-[3px] border-[#5ea3cc] pl-2.5 text-[16px] font-bold text-[#dcebf7]">
            {group.name}
          </h2>
          <ul className="mt-3 space-y-2 text-[14px]">
            {group.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-[#6fb7e0] hover:text-[#e8c877]"
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
