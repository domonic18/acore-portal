import type { Pool } from "mysql2/promise";

export declare const CATEGORY_MAP: Record<number, string>;
export declare const PAGE_MAP: Array<{ wpId: number; slug: string }>;
export declare const PROGRESSION_PAGE_ID: number;

export declare function loadImageMap(pool: Pool): Promise<Map<string, string>>;

export declare function importCategories(pool: Pool): Promise<Record<string, number>>;

export declare function importArticles(
  pool: Pool,
  opts?: { postIds?: number[] },
): Promise<{
  scanned: number;
  imported: number;
  noCategory: number;
  imageMapped: number;
  imageUnmapped: number;
}>;

export declare function importPages(
  pool: Pool,
  opts?: { pages?: Array<{ wpId: number; slug: string }> },
): Promise<{ total: number; inserted: number; updated: number }>;

export declare function importProgression(
  pool: Pool,
  opts?: { pageId?: number },
): Promise<{ parsed: number; imported: number }>;

export declare function reconcile(pool: Pool): Promise<{
  articles: { wp: number; imported: number };
  viewsDiffRows: Array<{ id: unknown; slug: string; views: number; wp_views: number }>;
  pages: number;
  progressionNodes: number;
}>;

export declare function scanContentDeadlinks(pool: Pool): Promise<{
  articles: number;
  pages: number;
  progressionNodes: number;
  refs: Array<{ table: string; key: string; url: string }>;
}>;
