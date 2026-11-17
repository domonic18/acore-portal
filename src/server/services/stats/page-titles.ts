import "server-only";
import { prisma } from "@/lib/db";

/**
 * 页面标题解析(看板可读性,2026-11-17):
 * 热门页面/在线/最近访问里的 URI 有两代形态——旧站查询串(?p=2437、?page_id=2、
 * ?post_type=product)与新站路径(/post/:slug、/shop/:slug、/forum/thread/:id),
 * 裸显示都不可读。本服务批量把 URI 解析成标题,解析不到回落 null(调用方显示原路径)。
 *
 * 分类(纯函数)与查询(批量、逐源容错)分离,便于单测。
 * wp_legacy 查询走 $queryRawUnsafe + 位置绑定「?」(IN 列表占位符按数量生成,
 * 值一律绑定,不拼字符串——与 traffic.ts「全字面量 SQL + 值绑定」同精神);
 * wp_legacy 为只读存档:查询失败(未导入)整源回落空,不拖垮看板。
 */

/** URI 解析计划(纯函数输出,resolvePageTitles 据此批量取数) */
export type UriLookup =
  | { kind: "home" }
  | { kind: "static"; title: string }
  | { kind: "wpPostId"; id: number }
  | { kind: "wpCatId"; id: number }
  | { kind: "wpPostSlug"; slug: string }
  | { kind: "article"; slug: string }
  | { kind: "product"; slug: string }
  | { kind: "thread"; id: number }
  | { kind: "raw" };

/** 新站固定文案路径(页面埋点路径无查询串,精确/去尾斜杠各试一次) */
const STATIC_PATHS: Record<string, string> = {
  "/shop": "积分商店",
  "/cart": "购物车",
  "/checkout": "结算",
  "/forum": "论坛",
  "/banlist": "封禁记录",
  "/login": "登录",
  "/register": "注册",
  "/news": "资讯",
  "/guides": "攻略",
};

/** 旧站 post_type 归档页(仅收录语义确定的,未知回落原路径) */
const WP_POST_TYPES: Record<string, string> = {
  product: "积分商店",
  post: "文章列表",
  page: "页面列表",
};

function parseQuery(uri: string): URLSearchParams | null {
  const qIndex = uri.indexOf("?");
  if (qIndex < 0) return null;
  try {
    return new URLSearchParams(uri.slice(qIndex + 1));
  } catch {
    return null;
  }
}

/** 单条 URI 分类(纯函数,不含 IO) */
export function classifyPageUri(uri: string): UriLookup {
  if (uri === "/" || uri === "") return { kind: "home" };

  const path = uri.split("?")[0] ?? uri;
  const trimmed = path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
  const staticTitle = STATIC_PATHS[trimmed];
  if (staticTitle) return { kind: "static", title: staticTitle };

  // 新站动态页:/post/:slug · /shop/:slug · /forum/thread/:id
  const article = trimmed.match(/^\/post\/([^/]+)$/);
  if (article) return { kind: "article", slug: article[1]! };
  const product = trimmed.match(/^\/shop\/([^/]+)$/);
  if (product) return { kind: "product", slug: product[1]! };
  const thread = trimmed.match(/^\/forum\/thread\/(\d+)$/);
  if (thread) return { kind: "thread", id: Number(thread[1]) };

  // 旧站查询串形态
  const q = parseQuery(uri);
  if (q) {
    const numParam = (name: string): number | null => {
      const v = q.get(name);
      return v && /^\d+$/.test(v) ? Number(v) : null;
    };
    const postId = numParam("p") ?? numParam("page_id") ?? numParam("attachment_id");
    if (postId != null) return { kind: "wpPostId", id: postId };
    const catId = numParam("cat");
    if (catId != null) return { kind: "wpCatId", id: catId };
    const postType = q.get("post_type");
    if (postType && WP_POST_TYPES[postType]) {
      return { kind: "static", title: WP_POST_TYPES[postType] };
    }
    const slugParam = q.get("product") ?? q.get("download") ?? q.get("tag") ?? q.get("product_cat");
    if (slugParam) return { kind: "wpPostSlug", slug: slugParam };
  }

  return { kind: "raw" };
}

function placeholders(n: number): string {
  return Array.from({ length: n }, () => "?").join(",");
}

type WpPostRow = { id: bigint; title: string; post_name: string | null };
type WpTermRow = { key: string; name: string };

function toInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** 批量解析:返回 uri → 标题(解析不到的不入 map);逐源容错 */
export async function resolvePageTitles(uris: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const plans = uris.map((uri) => ({ uri, lookup: classifyPageUri(uri) }));

  for (const { uri, lookup } of plans) {
    if (lookup.kind === "home") result.set(uri, "首页");
    if (lookup.kind === "static") result.set(uri, lookup.title);
  }

  const wpPostIds = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "wpPostId" ? [lookup.id] : []))),
  ];
  const wpCatIds = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "wpCatId" ? [lookup.id] : []))),
  ];
  const wpSlugs = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "wpPostSlug" ? [lookup.slug] : []))),
  ];
  const articleSlugs = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "article" ? [lookup.slug] : []))),
  ];
  const productSlugs = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "product" ? [lookup.slug] : []))),
  ];
  const threadIds = [
    ...new Set(plans.flatMap(({ lookup }) => (lookup.kind === "thread" ? [lookup.id] : []))),
  ];

  const [wpPostsById, wpPostsBySlug, wpCats, wpTerms, articles, products, threads] =
    await Promise.all([
      wpPostIds.length > 0
        ? prisma
            .$queryRawUnsafe<WpPostRow[]>(
              `SELECT ID AS id, post_title AS title, NULL AS post_name
               FROM wp_legacy.wp_posts WHERE ID IN (${placeholders(wpPostIds.length)})`,
              ...wpPostIds,
            )
            .catch(() => [] as WpPostRow[])
        : Promise.resolve([] as WpPostRow[]),
      wpSlugs.length > 0
        ? prisma
            .$queryRawUnsafe<WpPostRow[]>(
              `SELECT ID AS id, post_title AS title, post_name
               FROM wp_legacy.wp_posts WHERE post_name IN (${placeholders(wpSlugs.length)})
               ORDER BY ID ASC`,
              ...wpSlugs,
            )
            .catch(() => [] as WpPostRow[])
        : Promise.resolve([] as WpPostRow[]),
      wpCatIds.length > 0
        ? prisma
            .$queryRawUnsafe<WpTermRow[]>(
              `SELECT t.term_id AS \`key\`, t.name
               FROM wp_legacy.wp_terms t
               JOIN wp_legacy.wp_term_taxonomy tt ON tt.term_id = t.term_id
               WHERE tt.taxonomy = 'category'
                 AND (t.term_id IN (${placeholders(wpCatIds.length)})
                      OR tt.term_taxonomy_id IN (${placeholders(wpCatIds.length)}))`,
              ...wpCatIds,
              ...wpCatIds,
            )
            .catch(() => [] as WpTermRow[])
        : Promise.resolve([] as WpTermRow[]),
      wpSlugs.length > 0
        ? prisma
            .$queryRawUnsafe<WpTermRow[]>(
              `SELECT slug AS \`key\`, name FROM wp_legacy.wp_terms
               WHERE slug IN (${placeholders(wpSlugs.length)})`,
              ...wpSlugs,
            )
            .catch(() => [] as WpTermRow[])
        : Promise.resolve([] as WpTermRow[]),
      articleSlugs.length > 0
        ? prisma.article
            .findMany({
              where: { slug: { in: articleSlugs } },
              select: { slug: true, title: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      productSlugs.length > 0
        ? prisma.product
            .findMany({
              where: { slug: { in: productSlugs } },
              select: { slug: true, name: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
      threadIds.length > 0
        ? prisma.forumThread
            .findMany({
              where: { id: { in: threadIds.map((id) => BigInt(id)) } },
              select: { id: true, title: true },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);

  const postTitleById = new Map<number, string>();
  for (const row of wpPostsById) {
    const id = toInt(row.id);
    if (id != null) postTitleById.set(id, row.title);
  }

  // slug 参数先按 posts.post_name(商品/下载页)解析,再按 terms.slug(标签页)回落
  const postTitleBySlug = new Map<string, string>();
  for (const row of wpPostsBySlug) {
    if (row.post_name && !postTitleBySlug.has(row.post_name)) {
      postTitleBySlug.set(row.post_name, row.title);
    }
  }
  const termNameBySlug = new Map<string, string>();
  for (const row of wpTerms) termNameBySlug.set(row.key, row.name);

  const titleByCatId = new Map<number, string>();
  for (const row of wpCats) {
    const id = toInt(row.key);
    if (id != null) titleByCatId.set(id, row.name);
  }

  const titleByArticleSlug = new Map<string, string>(articles.map((a) => [a.slug, a.title]));
  const titleByProductSlug = new Map<string, string>(products.map((p) => [p.slug, p.name]));
  const titleByThreadId = new Map<string, string>(
    threads.map((t) => [t.id.toString(), t.title]),
  );

  for (const { uri, lookup } of plans) {
    if (result.has(uri)) continue;
    let title: string | null = null;
    switch (lookup.kind) {
      case "wpPostId":
        title = postTitleById.get(lookup.id) ?? null;
        break;
      case "wpCatId":
        title = titleByCatId.get(lookup.id) ?? null;
        break;
      case "wpPostSlug":
        title = postTitleBySlug.get(lookup.slug) ?? termNameBySlug.get(lookup.slug) ?? null;
        break;
      case "article":
        title = titleByArticleSlug.get(lookup.slug) ?? null;
        break;
      case "product":
        title = titleByProductSlug.get(lookup.slug) ?? null;
        break;
      case "thread":
        title = titleByThreadId.get(String(lookup.id)) ?? null;
        break;
      default:
        title = null;
    }
    if (title) result.set(uri, title);
  }

  return result;
}
