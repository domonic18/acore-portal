import "server-only";

import { prisma } from "@/lib/db/business";
import type { SearchGroup } from "@/constants/search";

/**
 * FULLTEXT 关键词检索层:各实体 MATCH...AGAINST(ngram BOOLEAN MODE 短语匹配)。
 * 字段加权在查询层完成——标题组与正文组分立索引,标题命中 ×3、正文 ×1
 * (FAQ 组 ×2,介于标题与正文)。bq 必须经 buildBooleanQuery 清洗(短语包裹)。
 */

export interface FulltextHit {
  /** 融合键 `{entityType}:{id}`(与语义路候选键同域,RRF 融合用) */
  key: string;
  /** 实体 id(FAQ 命中=faq id;去重与日志键) */
  id: string;
  /** FAQ 命中额外携带,渲染与回链用 */
  faqProductId?: string;
  slug: string;
  /** FAQ 命中=商品名(展示兜底),其余实体不设 */
  productName?: string;
  title: string;
  score: number;
}

/** 组 → 实体类型键(FAQ 命中行由 product_id 判别,单独分支) */
const GROUP_ENTITY_KEY: Record<SearchGroup, string> = {
  articles: "article",
  pages: "content_page",
  products: "product",
  forum: "forum_thread",
};

interface RawHit {
  id: bigint;
  slug: string;
  title: string;
  product_id: bigint | null;
  product_name: string | null;
  score: number;
}

export async function fulltextSearch(
  group: SearchGroup,
  bq: string,
  limit: number,
): Promise<FulltextHit[]> {
  if (!bq) return [];
  const rows = await queryGroup(group, bq, limit);
  return rows.map((r) => ({
    key: r.product_id ? `product_faq:${r.id}` : `${GROUP_ENTITY_KEY[group]}:${r.id}`,
    id: String(r.id),
    faqProductId: r.product_id ? String(r.product_id) : undefined,
    productName: r.product_name ?? undefined,
    slug: r.slug,
    title: r.title,
    score: Number(r.score),
  }));
}

export async function fulltextCount(group: SearchGroup, bq: string): Promise<number> {
  if (!bq) return 0;
  const rows = await countGroup(group, bq);
  return Number(rows[0]?.total ?? 0);
}

function queryGroup(group: SearchGroup, bq: string, limit: number) {
  switch (group) {
    case "articles":
      return prisma.$queryRaw<RawHit[]>`
        SELECT a.id, a.slug, a.title, NULL AS product_id, NULL AS product_name,
          MATCH(a.title) AGAINST(${bq} IN BOOLEAN MODE) * 3
          + MATCH(a.body_md) AGAINST(${bq} IN BOOLEAN MODE) AS score
        FROM article a
        WHERE a.status = 'published'
          AND (MATCH(a.title) AGAINST(${bq} IN BOOLEAN MODE)
            OR MATCH(a.body_md) AGAINST(${bq} IN BOOLEAN MODE))
        ORDER BY score DESC
        LIMIT ${limit}`;
    case "pages":
      return prisma.$queryRaw<RawHit[]>`
        SELECT c.id, c.slug, c.title, NULL AS product_id, NULL AS product_name,
          MATCH(c.title) AGAINST(${bq} IN BOOLEAN MODE) * 3
          + MATCH(c.body_md) AGAINST(${bq} IN BOOLEAN MODE) AS score
        FROM content_page c
        WHERE c.status = 'published'
          AND (MATCH(c.title) AGAINST(${bq} IN BOOLEAN MODE)
            OR MATCH(c.body_md) AGAINST(${bq} IN BOOLEAN MODE))
        ORDER BY score DESC
        LIMIT ${limit}`;
    case "products":
      return prisma.$queryRaw<RawHit[]>`
        (SELECT p.id, p.slug, p.name AS title, NULL AS product_id, NULL AS product_name,
          MATCH(p.name) AGAINST(${bq} IN BOOLEAN MODE) * 3
          + MATCH(p.description, p.detail_md) AGAINST(${bq} IN BOOLEAN MODE) AS score
        FROM product p
        WHERE p.status = 'published' AND p.listed = true
          AND (MATCH(p.name) AGAINST(${bq} IN BOOLEAN MODE)
            OR MATCH(p.description, p.detail_md) AGAINST(${bq} IN BOOLEAN MODE)))
        UNION ALL
        (SELECT f.id, p.slug, f.question AS title, p.id AS product_id, p.name AS product_name,
          MATCH(f.question, f.answer) AGAINST(${bq} IN BOOLEAN MODE) * 2 AS score
        FROM product_faq f
        JOIN product p ON p.id = f.product_id
        WHERE p.status = 'published' AND p.listed = true
          AND MATCH(f.question, f.answer) AGAINST(${bq} IN BOOLEAN MODE))
        ORDER BY score DESC
        LIMIT ${limit}`;
    case "forum":
      return prisma.$queryRaw<RawHit[]>`
        SELECT t.id, '' AS slug, t.title, NULL AS product_id, NULL AS product_name,
          MATCH(t.title) AGAINST(${bq} IN BOOLEAN MODE) AS score
        FROM forum_thread t
        WHERE t.deleted_at IS NULL
          AND MATCH(t.title) AGAINST(${bq} IN BOOLEAN MODE)
        ORDER BY score DESC
        LIMIT ${limit}`;
  }
}

function countGroup(group: SearchGroup, bq: string) {
  switch (group) {
    case "articles":
      return prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM article a
        WHERE a.status = 'published'
          AND (MATCH(a.title) AGAINST(${bq} IN BOOLEAN MODE)
            OR MATCH(a.body_md) AGAINST(${bq} IN BOOLEAN MODE))`;
    case "pages":
      return prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM content_page c
        WHERE c.status = 'published'
          AND (MATCH(c.title) AGAINST(${bq} IN BOOLEAN MODE)
            OR MATCH(c.body_md) AGAINST(${bq} IN BOOLEAN MODE))`;
    case "products":
      return prisma.$queryRaw<{ total: bigint }[]>`
        SELECT
          (SELECT COUNT(*) FROM product p
           WHERE p.status = 'published' AND p.listed = true
             AND (MATCH(p.name) AGAINST(${bq} IN BOOLEAN MODE)
               OR MATCH(p.description, p.detail_md) AGAINST(${bq} IN BOOLEAN MODE)))
          + (SELECT COUNT(*) FROM product_faq f
             JOIN product p ON p.id = f.product_id
             WHERE p.status = 'published' AND p.listed = true
               AND MATCH(f.question, f.answer) AGAINST(${bq} IN BOOLEAN MODE))
          AS total`;
    case "forum":
      return prisma.$queryRaw<{ total: bigint }[]>`
        SELECT COUNT(*) AS total FROM forum_thread t
        WHERE t.deleted_at IS NULL
          AND MATCH(t.title) AGAINST(${bq} IN BOOLEAN MODE)`;
  }
}
