import "server-only";
import { z } from "zod";
import { prisma } from "@/lib/db/business";
import {
  DEFAULT_COMPONENT_PAGES,
  SIDEBAR_COMPONENT_KEYS,
  SITE_PAGE_TYPES,
  type SidebarComponentKey,
  type SitePageType,
} from "@/constants/content";
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

/**
 * 内置组件页面范围全量(前台渲染+后台编辑共用):行缺失/脏数据回落代码缺省
 * DEFAULT_COMPONENT_PAGES(空数组是显式"全站隐藏"配置,不回落)。
 */
export async function listSidebarComponentPages(): Promise<
  Record<SidebarComponentKey, SitePageType[]>
> {
  const rows = await prisma.sidebarComponent.findMany({
    select: { key: true, pages: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.pages]));
  return Object.fromEntries(
    SIDEBAR_COMPONENT_KEYS.map((key) => {
      const parsed = pagesSchema.safeParse(byKey.get(key));
      return [
        key,
        parsed.success ? parsed.data : [...DEFAULT_COMPONENT_PAGES[key]],
      ] as const;
    }),
  ) as Record<SidebarComponentKey, SitePageType[]>;
}

/** 页面类型命中的内置组件(注册表顺序;供渲染层映射组件) */
export async function enabledSidebarComponents(
  pageType: SitePageType,
): Promise<SidebarComponentKey[]> {
  const pages = await listSidebarComponentPages();
  return SIDEBAR_COMPONENT_KEYS.filter((key) => pages[key].includes(pageType));
}
