import { EXTERNAL_LINKS } from "@/constants/content";
import { SidebarCard } from "./card";

/** 外部三链(R9):友情链接 */
export function ExternalLinks() {
  return (
    <SidebarCard title="友情链接" testId="sidebar-external-links">
      <ul className="space-y-1.5 text-xs">
        {EXTERNAL_LINKS.map((l) => (
          <li key={l.label}>
            <a
              href={l.href}
              target="_blank"
              rel="noreferrer noopener"
              className="text-[#c7d2e0] hover:text-[#e6d8a8]"
            >
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </SidebarCard>
  );
}
