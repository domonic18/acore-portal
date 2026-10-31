// 内容域存量导入(US2 T013;research R16):wp_legacy → acore_portal
//   wp_posts(post)   → article      (bodyMd 转换+图片重写+views 初始化,111 篇)
//   wp_posts(page)   → content_page (仅 4 静态内容页;功能面页面走 route_map 重定向)
//   wp_terms(tag)    → tag + article_tag
//   渐进计划页 2796  → progression_node(cp-timeline 区块解析,28 档,"To be continued" 剔除)
// 幂等:article/content_page/progression 按 legacy 键 NOT EXISTS/UPDATE,可反复执行
// 对账:reconcile() 尾部断言(行数对列/views 对列),CLI 与 T015 演练共用
// 死链:scanContentDeadlinks() 扫三落地表 /wp-content/uploads/ 残留(映射未覆盖即源文件缺失)
import { pathToFileURL } from "node:url";
import {
  createConverter,
  decodeSlug,
  extractExcerpt,
  normalizeWowheadShortcodes,
  parseProgressionBlocks,
} from "./lib/content-convert.mjs";

// 源摸底(2026-10-24,wp_legacy):cat 1=网站公告28 / 83=游戏资讯67 / 68=资料梳理15 / 94=featured(0,跳过)
export const CATEGORY_MAP = { 1: "announcements", 83: "news", 68: "guides" };
// 静态内容页固定 slug 映射(核心保留 slug,见 src/constants/content.ts CORE_PAGE_SLUGS);
// 其余 16 页为功能面(论坛/商店/渐进/档案),只进 route_map 不做 content_page
export const PAGE_MAP = [
  { wpId: 2, slug: "tutorial" },
  { wpId: 135, slug: "about" },
  { wpId: 1407, slug: "agreement" },
  { wpId: 4182, slug: "sitemap" },
];
export const PROGRESSION_PAGE_ID = 2796;

/** image_asset_map 装载为同步 Map(turndown 规则不能异步回库) */
export async function loadImageMap(pool) {
  const [rows] = await pool.query(
    `SELECT old_url, new_url FROM acore_portal.image_asset_map`,
  );
  return new Map(rows.map((r) => [r.old_url, r.new_url]));
}

function makeResolver(imageMap) {
  return (src) => {
    if (!src) return undefined;
    const normalized = src.replace(/^https?:\/\/[^/]+/, "");
    return imageMap.get(normalized);
  };
}

/** 确保 3 个源分类存在(通常已被 seed 建立),返回 slug→id */
export async function importCategories(pool) {
  const [wpCats] = await pool.query(
    `SELECT term_id, name FROM wp_legacy.wp_terms WHERE term_id IN (?, ?, ?)`,
    Object.keys(CATEGORY_MAP).map(Number),
  );
  const nameBySlug = Object.fromEntries(
    wpCats.map((r) => [CATEGORY_MAP[r.term_id], r.name]),
  );
  const bySlug = {};
  for (const slug of Object.values(CATEGORY_MAP)) {
    const [rows] = await pool.query(
      `SELECT id FROM acore_portal.article_category WHERE slug = ?`,
      [slug],
    );
    if (rows.length > 0) {
      bySlug[slug] = rows[0].id;
      continue;
    }
    const [ins] = await pool.query(
      `INSERT INTO acore_portal.article_category (name, slug, sort) VALUES (?, ?, 0)`,
      [nameBySlug[slug] ?? slug, slug],
    );
    bySlug[slug] = ins.insertId;
  }
  return bySlug;
}

function countImageRewrites(html, imageMap) {
  let mapped = 0;
  let unmapped = 0;
  const re = /https?:\/\/[^"'\s>]+\/wp-content\/uploads\/[^"'\s>)]+|\/wp-content\/uploads\/[^"'\s>)]+/g;
  for (const raw of html.match(re) ?? []) {
    if (imageMap.has(raw.replace(/^https?:\/\/[^/]+/, ""))) mapped += 1;
    else unmapped += 1;
  }
  return { mapped, unmapped };
}

/** 文章导入:wp_posts(post) → article。postIds 限定作用域(测试);缺省全量 */
export async function importArticles(pool, { postIds } = {}) {
  const imageMap = await loadImageMap(pool);
  const toMd = createConverter(makeResolver(imageMap));
  const cats = await importCategories(pool);
  const fallbackCatId = cats.announcements;

  const scope = postIds?.length
    ? `AND p.ID IN (${postIds.map(() => "?").join(",")})`
    : "";
  const [posts] = await pool.query(
    `SELECT p.ID, p.post_name, p.post_title, p.post_content, p.post_status, p.post_date,
            COALESCE(v.cnt, 0) AS views
       FROM wp_legacy.wp_posts p
       LEFT JOIN (
         SELECT id, \`count\` cnt FROM wp_legacy.wp_post_views WHERE type = 4 AND period = 'total'
       ) v ON v.id = p.ID
      WHERE p.post_type = 'post' AND p.post_status IN ('publish', 'draft') ${scope}
        AND NOT EXISTS (
          SELECT 1 FROM acore_portal.article a WHERE a.legacy_wp_post_id = p.ID
        )`,
    postIds ?? [],
  );

  // 分类关联:命中的多分类取 MIN(term_id)(1<68<83 → 公告>资料>资讯,确定性)
  const ids = posts.map((p) => p.ID);
  const catByPost = new Map();
  if (ids.length > 0) {
    const [rels] = await pool.query(
      `SELECT tr.object_id, MIN(tt.term_id) AS term_id
         FROM wp_legacy.wp_term_relationships tr
         JOIN wp_legacy.wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
        WHERE tt.taxonomy = 'category'
          AND tt.term_id IN (${Object.keys(CATEGORY_MAP)
            .map(() => "?")
            .join(",")})
          AND tr.object_id IN (${ids.map(() => "?").join(",")})
        GROUP BY tr.object_id`,
      [...Object.keys(CATEGORY_MAP).map(Number), ...ids],
    );
    for (const r of rels) catByPost.set(r.object_id, CATEGORY_MAP[r.term_id]);
  }

  let noCategory = 0;
  let imageMapped = 0;
  let imageUnmapped = 0;
  let imported = 0;
  for (const p of posts) {
    const { mapped, unmapped } = countImageRewrites(p.post_content ?? "", imageMap);
    imageMapped += mapped;
    imageUnmapped += unmapped;
    const catSlug = catByPost.get(p.ID);
    if (!catSlug) noCategory += 1;
    const slug0 = decodeSlug(p.post_name, p.ID);
    const bodyMd = normalizeWowheadShortcodes(toMd(p.post_content ?? ""));
    const status = p.post_status === "publish" ? "published" : "draft";
    let inserted = false;
    for (const slug of [slug0, `${slug0}-${p.ID}`]) {
      try {
        await pool.query(
          `INSERT INTO acore_portal.article
             (slug, title, excerpt, body_md, category_id, status, published_at, views, legacy_wp_post_id, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            slug,
            p.post_title,
            extractExcerpt(p.post_content ?? ""),
            bodyMd,
            catSlug ? cats[catSlug] : fallbackCatId,
            status,
            status === "published" ? p.post_date : null,
            Number(p.views),
            p.ID,
          ],
        );
        inserted = true;
        break;
      } catch (err) {
        // slug 撞唯一键:追加 -{wpId} 重试一次;其余错误照抛
        if (slug !== slug0 && err?.code === "ER_DUP_ENTRY") continue;
        if (err?.code !== "ER_DUP_ENTRY") throw err;
      }
    }
    if (inserted) imported += 1;
  }
  return { scanned: posts.length, imported, noCategory, imageMapped, imageUnmapped };
}

/** 静态页导入(默认 PAGE_MAP;测试可传定制 pages)。命中既有 slug 即原位更新(覆盖 seed 内容) */
export async function importPages(pool, { pages = PAGE_MAP } = {}) {
  const imageMap = await loadImageMap(pool);
  const toMd = createConverter(makeResolver(imageMap));
  let imported = 0;
  let updated = 0;
  for (const [i, { wpId, slug }] of pages.entries()) {
    const [rows] = await pool.query(
      `SELECT post_title, post_content, post_status FROM wp_legacy.wp_posts
        WHERE ID = ? AND post_type = 'page'`,
      [wpId],
    );
    if (rows.length === 0) throw new Error(`wp page ${wpId} 不存在`);
    const page = rows[0];
    const bodyMd = normalizeWowheadShortcodes(toMd(page.post_content ?? ""));
    const status = page.post_status === "publish" ? "published" : "draft";
    const [upd] = await pool.query(
      `UPDATE acore_portal.content_page
          SET title = ?, body_md = ?, status = ?, legacy_wp_page_id = ?, sort_order = ?
        WHERE slug = ?`,
      [page.post_title, bodyMd, status, wpId, i + 1, slug],
    );
    if (upd.affectedRows > 0) {
      updated += 1;
      continue;
    }
    await pool.query(
      `INSERT INTO acore_portal.content_page
         (slug, title, body_md, status, sort_order, legacy_wp_page_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(3))`,
      [slug, page.post_title, bodyMd, status, i + 1, wpId],
    );
    imported += 1;
  }
  return { total: pages.length, inserted: imported, updated };
}

/** 渐进计划导入:cp-timeline 区块 → progression_node(legacyWpKey='cp:{blockId}' 幂等) */
export async function importProgression(pool, { pageId = PROGRESSION_PAGE_ID } = {}) {
  const imageMap = await loadImageMap(pool);
  const toMd = createConverter(makeResolver(imageMap));
  const [rows] = await pool.query(
    `SELECT post_content FROM wp_legacy.wp_posts WHERE ID = ? AND post_type = 'page'`,
    [pageId],
  );
  if (rows.length === 0) throw new Error(`progression 源页 ${pageId} 不存在`);
  const nodes = parseProgressionBlocks(rows[0].post_content ?? "");
  let imported = 0;
  for (const [i, n] of nodes.entries()) {
    const legacyKey = `cp:${n.blockId ?? `${i}-${n.heading}`}`;
    const bodyMd = n.descHtml ? toMd(n.descHtml) : null;
    const imageUrl = n.imageUrl ? (makeResolver(imageMap)(n.imageUrl) ?? n.imageUrl) : null;
    const [upd] = await pool.query(
      `UPDATE acore_portal.progression_node
          SET title = ?, phase_date = ?, image_url = ?, body_md = ?, status = ?, sort = ?
        WHERE legacy_wp_key = ?`,
      [n.heading, n.date, imageUrl, bodyMd, n.open ? "open" : "locked", i + 1, legacyKey],
    );
    if (upd.affectedRows > 0) continue;
    await pool.query(
      `INSERT INTO acore_portal.progression_node
         (title, phase_date, image_url, body_md, status, sort, legacy_wp_key, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [n.heading, n.date, imageUrl, bodyMd, n.open ? "open" : "locked", i + 1, legacyKey],
    );
    imported += 1;
  }
  return { parsed: nodes.length, imported };
}

/** 对账(quickstart S2):行数对列 + views 对列;差集非空即红 */
export async function reconcile(pool) {
  const [srcCount] = await pool.query(
    `SELECT COUNT(*) n FROM wp_legacy.wp_posts WHERE post_type = 'post' AND post_status IN ('publish','draft')`,
  );
  const [dstCount] = await pool.query(
    `SELECT COUNT(*) n FROM acore_portal.article WHERE legacy_wp_post_id IS NOT NULL`,
  );
  const [viewDiffs] = await pool.query(
    `SELECT a.id, a.slug, a.views, COALESCE(v.cnt, 0) AS wp_views
       FROM acore_portal.article a
       JOIN wp_legacy.wp_posts p ON p.ID = a.legacy_wp_post_id
       LEFT JOIN (
         SELECT id, \`count\` cnt FROM wp_legacy.wp_post_views WHERE type = 4 AND period = 'total'
       ) v ON v.id = p.ID
      WHERE a.views <> COALESCE(v.cnt, 0)`,
  );
  const [pageCount] = await pool.query(
    `SELECT COUNT(*) n FROM acore_portal.content_page WHERE legacy_wp_page_id IS NOT NULL`,
  );
  const [progCount] = await pool.query(
    `SELECT COUNT(*) n FROM acore_portal.progression_node WHERE legacy_wp_key LIKE 'cp:%'`,
  );
  return {
    articles: { wp: Number(srcCount[0].n), imported: Number(dstCount[0].n) },
    viewsDiffRows: viewDiffs,
    pages: Number(pageCount[0].n),
    progressionNodes: Number(progCount[0].n),
  };
}

/**
 * 内容域死链扫描(T015;复用 M2 cos-upload 扫描口径):三个落地表里的
 * /wp-content/uploads/ 残留 = 映射未覆盖(源文件缺失),渲染前 allowlist 也会剥,
 * 但迁移期必须清零——逐条列出表/键/URL。
 */
export async function scanContentDeadlinks(pool) {
  const [articles] = await pool.query(
    `SELECT id, slug, body_md FROM acore_portal.article WHERE body_md LIKE '%/wp-content/uploads/%'`,
  );
  const [pages] = await pool.query(
    `SELECT id, slug, body_md FROM acore_portal.content_page WHERE body_md LIKE '%/wp-content/uploads/%'`,
  );
  const [nodes] = await pool.query(
    `SELECT id, legacy_wp_key, image_url, body_md FROM acore_portal.progression_node
      WHERE image_url LIKE '%/wp-content/uploads/%' OR body_md LIKE '%/wp-content/uploads/%'`,
  );
  const refs = [];
  for (const r of articles) {
    for (const url of r.body_md.match(/\/wp-content\/uploads\/[^"'\s>)\]]+/g) ?? []) {
      refs.push({ table: "article", key: r.slug, url });
    }
  }
  for (const r of pages) {
    for (const url of r.body_md.match(/\/wp-content\/uploads\/[^"'\s>)\]]+/g) ?? []) {
      refs.push({ table: "content_page", key: r.slug, url });
    }
  }
  for (const r of nodes) {
    if (r.image_url?.includes("/wp-content/uploads/")) {
      refs.push({ table: "progression_node", key: r.legacy_wp_key, url: r.image_url });
    }
    for (const url of (r.body_md ?? "").match(/\/wp-content\/uploads\/[^"'\s>)\]]+/g) ?? []) {
      refs.push({ table: "progression_node", key: r.legacy_wp_key, url });
    }
  }
  return {
    articles: articles.length,
    pages: pages.length,
    progressionNodes: nodes.length,
    refs,
  };
}

// ---- CLI 入口(vitest 导入时不执行) ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { config } = await import("dotenv");
  config({ path: new URL("../../.env", import.meta.url).pathname });
  const { createPool } = await import("mysql2/promise");
  const url = new URL(process.env.DATABASE_URL);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 2,
    timezone: "+00:00",
  });
  const categories = await importCategories(pool);
  const articles = await importArticles(pool);
  const pages = await importPages(pool);
  const progression = await importProgression(pool);
  const audit = await reconcile(pool);
  const deadlinks = await scanContentDeadlinks(pool);
  console.log(
    JSON.stringify(
      {
        categories: Object.fromEntries(
          Object.entries(categories).map(([k, v]) => [k, String(v)]),
        ),
        articles,
        pages,
        progression,
        reconcile: { ...audit, viewsDiffRows: audit.viewsDiffRows.length },
        deadlinks,
      },
      null,
      2,
    ),
  );
  if (audit.viewsDiffRows.length > 0 || deadlinks.refs.length > 0) process.exitCode = 1;
  await pool.end();
}
