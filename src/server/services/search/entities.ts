import "server-only";

import { prisma } from "@/lib/db/business";
import {
  SEARCH_GROUP_LABELS,
  type SearchEntityType,
  type SearchGroup,
} from "@/constants/search";
import { extractSnippet, stripMarkdown } from "./highlight";

/**
 * 命中实体回查:关键词路与语义路的候选 id 并集,按实体类型批量取行,
 * 转 SearchHit(url/title/snippet 契约,Agent 引用卡片与降级态列表共用)。
 */

export interface EntityRow {
  key: string; // `{entityType}:{id}`,RRF 融合键
  entityType: SearchEntityType;
  id: string;
  url: string;
  title: string;
  snippetSource: string;
  productName?: string;
}

export interface SearchHit {
  key: string;
  group: SearchGroup;
  groupLabel: string;
  url: string;
  title: string;
  snippet: string;
  faq: boolean;
}

export const ENTITY_GROUP: Record<SearchEntityType, SearchGroup> = {
  article: "articles",
  content_page: "pages",
  product: "products",
  product_faq: "products",
  forum_thread: "forum",
};

/** 按类型批量回查实体行(过滤发布/上架/软删口径与 FULLTEXT 查询一致) */
export async function fetchEntityRows(
  entityType: SearchEntityType,
  ids: string[],
): Promise<Map<string, EntityRow>> {
  const out = new Map<string, EntityRow>();
  if (ids.length === 0) return out;
  const bigIds = ids.map(BigInt);

  switch (entityType) {
    case "article": {
      const rows = await prisma.article.findMany({
        where: { id: { in: bigIds }, status: "published" },
        select: { id: true, slug: true, title: true, bodyMd: true },
      });
      for (const r of rows) {
        const key = `article:${r.id}`;
        out.set(key, {
          key,
          entityType,
          id: r.id.toString(),
          url: `/post/${r.slug}`,
          title: r.title,
          snippetSource: r.bodyMd,
        });
      }
      break;
    }
    case "content_page": {
      const rows = await prisma.contentPage.findMany({
        where: { id: { in: bigIds }, status: "published" },
        select: { id: true, slug: true, title: true, bodyMd: true },
      });
      for (const r of rows) {
        const key = `content_page:${r.id}`;
        out.set(key, {
          key,
          entityType,
          id: r.id.toString(),
          url: `/${r.slug}`,
          title: r.title,
          snippetSource: r.bodyMd,
        });
      }
      break;
    }
    case "product": {
      const rows = await prisma.product.findMany({
        where: { id: { in: bigIds }, status: "published", listed: true },
        select: { id: true, slug: true, name: true, description: true },
      });
      for (const r of rows) {
        const key = `product:${r.id}`;
        out.set(key, {
          key,
          entityType,
          id: r.id.toString(),
          url: `/shop/${r.slug}`,
          title: r.name,
          snippetSource: r.description,
        });
      }
      break;
    }
    case "product_faq": {
      const rows = await prisma.productFaq.findMany({
        where: {
          id: { in: bigIds },
          product: { status: "published", listed: true },
        },
        select: {
          id: true,
          question: true,
          answer: true,
          product: { select: { id: true, slug: true, name: true } },
        },
      });
      for (const r of rows) {
        const key = `product_faq:${r.id}`;
        out.set(key, {
          key,
          entityType,
          id: r.id.toString(),
          url: `/shop/${r.product.slug}`,
          title: r.question,
          snippetSource: r.answer,
          productName: r.product.name,
        });
      }
      break;
    }
    case "forum_thread": {
      const rows = await prisma.forumThread.findMany({
        where: { id: { in: bigIds }, deletedAt: null },
        select: { id: true, title: true },
      });
      for (const r of rows) {
        const key = `forum_thread:${r.id}`;
        out.set(key, {
          key,
          entityType,
          id: r.id.toString(),
          url: `/forum/thread/${r.id}`,
          title: r.title,
          // W1 只索引主题标题(楼层正文新旧混存),片段回落标题本身
          snippetSource: r.title,
        });
      }
      break;
    }
  }
  return out;
}

export function rowToHit(row: EntityRow, terms: string[]): SearchHit {
  return {
    key: row.key,
    group: ENTITY_GROUP[row.entityType],
    groupLabel: SEARCH_GROUP_LABELS[ENTITY_GROUP[row.entityType]],
    url: row.url,
    title: row.title,
    snippet: extractSnippet(stripMarkdown(row.snippetSource), terms),
    faq: row.entityType === "product_faq",
  };
}
