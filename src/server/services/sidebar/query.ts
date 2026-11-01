import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";
import { SITE_PAGE_TYPES, type SitePageType } from "@/constants/content";
import type { SidebarCardConfig } from "@/constants/sidebar";

/**
 * 侧栏快捷卡读取(前台渲染 + 后台编辑共用):卡片/链接按 sort 升序,
 * pages 为 JSON 数组,读取时经 zod 收口,脏数据回退空数组(卡片不展示)。
 */
const pagesSchema = z.array(z.enum(SITE_PAGE_TYPES));

type SidebarCardRow = {
  key: string;
  title: string;
  pages: unknown;
  body: string | null;
  links: { label: string; href: string; note: string | null }[];
};

function toCard(row: SidebarCardRow): SidebarCardConfig {
  const pages = pagesSchema.safeParse(row.pages);
  return {
    key: row.key,
    title: row.title,
    pages: pages.success ? pages.data : [],
    body: row.body ?? undefined,
    links: row.links.map((link) => ({
      label: link.label,
      href: link.href,
      note: link.note ?? undefined,
    })),
  };
}

export async function listAllSidebarCards(): Promise<SidebarCardConfig[]> {
  const rows = await prisma.sidebarCard.findMany({
    orderBy: { sort: "asc" },
    select: {
      key: true,
      title: true,
      pages: true,
      body: true,
      links: {
        orderBy: { sort: "asc" },
        select: { label: true, href: true, note: true },
      },
    },
  });
  return rows.map(toCard);
}

export async function listSidebarCards(pageType: SitePageType): Promise<SidebarCardConfig[]> {
  const cards = await listAllSidebarCards();
  return cards.filter((card) => card.pages.includes(pageType));
}
