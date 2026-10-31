// 论坛导入脚本类型声明(scripts/migrate/forum-import.mjs)
export const BOARD_DEFS: Array<{ wpId: number; slug: string; name: string }>;

export function loadImageMap(pool: unknown): Promise<Map<string, string>>;
export function rewriteForumImages(
  html: string | null | undefined,
  imageMap: Map<string, string>,
): string;
export function importBoards(
  pool: unknown,
  opts?: { forumIds?: number[] },
): Promise<{ scanned: number; imported: number }>;
export function importThreads(
  pool: unknown,
  opts?: { topicIds?: number[] },
): Promise<{
  scanned: number;
  imported: number;
  mappedAuthors: number;
  orphanTopics: number;
}>;
export function importPosts(
  pool: unknown,
  opts?: { topicIds?: number[] },
): Promise<{ mainPosts: number; imported: number; replies: number }>;
export function reconcile(pool: unknown): Promise<{
  wp: { boards: number; topics: number; replies: number };
  db: {
    boards: number;
    threads: number;
    threads_visible: number;
    posts: number;
    posts_visible: number;
    mapped_threads: number;
    mapped_posts: number;
  };
  threadsDiff: number;
  postsDiff: number;
}>;
