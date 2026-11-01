import Link from "next/link";
import type { SidebarCardConfig } from "@/constants/sidebar";
import { SidebarCard } from "./card";

/**
 * 侧栏快捷卡(M4 通用化):数据由 SiteSidebar 按页面类型读取后传入;
 * 卡片=标题+可选正文+有序链接,后台 /admin/sidebar 维护。
 */
export function SidebarQuickCards({ cards }: { cards: SidebarCardConfig[] }) {
  if (cards.length === 0) return null;

  return (
    <>
      {cards.map((card) => (
        <SidebarCard key={card.key} title={card.title} testId={`sidebar-card-${card.key}`}>
          <div className="space-y-2">
            {card.body ? <p className="text-xs text-[#8fa0b8]">{card.body}</p> : null}
            {card.links.map((link, index) => (
              <Link
                key={`${link.href}-${index}`}
                href={link.href}
                className="block rounded bg-[#16233a] px-3 py-2 text-center text-xs text-[#c7d2e0] hover:bg-[#1c2c48] hover:text-[#e6d8a8]"
              >
                {link.note ? `${link.label} · ${link.note}` : link.label}
              </Link>
            ))}
          </div>
        </SidebarCard>
      ))}
    </>
  );
}
