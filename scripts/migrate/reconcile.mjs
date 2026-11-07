// 迁移统一对账断言器(2026-11-07 迁移就绪度收口):
//
// 此前每个导入脚本尾巴各带一段 SELECT 报告,**只有 content-import / forum-import /
// import-points 三家会置退出码**,shop-import / route-map-m3 / wp-users-import 只打印不阻断
// ——CI 里"跑过了"≠"迁对了"。本文件把对账收敛成一处:按域逐项比「源应有」与「目标实有」,
// 差额可解释(如商品 SKU 重复导致 ODKU no-op)降 WARN,不可解释的缺失一律 FAIL 并以退出码 1 拦停。
//
// 判定口径:
//   PASS  实有 == 应有
//   WARN  有差额但差额已被数据条件解释(须人工过目)
//   FAIL  有差额且无解释 → 退出码 1(拦截交付)
//
// 只读、幂等;用法:DATABASE_URL=… node scripts/migrate/reconcile.mjs
import {
  reconcile as contentReconcile,
  scanContentDeadlinks,
  PAGE_MAP,
  DEVLOG_PAGE_ID,
} from "./content-import.mjs";
import { reconcile as forumReconcile } from "./forum-import.mjs";
import { GUIDE_PAGES } from "./promote-guide-pages.mjs";

/** 链尾应存在的「继承旧站」的静态页:PAGE_MAP 四页 + 开发日志单页 */
const LEGACY_PAGE_IDS = [...PAGE_MAP.map((p) => p.wpId), DEVLOG_PAGE_ID];
/** 升格为静态页的教程(原为 article,升格后从 article 删除 → 计入文章总数) */
const GUIDE_SLUGS = GUIDE_PAGES.map((g) => g.slug);

/** 域 → 一组断言。expected/actual 均为返回单行单列 count 的 SQL。 */
const SQL_CHECKS = [
  {
    id: "users",
    domain: "用户",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_users w
        WHERE CHAR_LENGTH(w.user_login) <= 32
          AND NOT EXISTS (SELECT 1 FROM \`user\` u
                          WHERE u.username = w.user_login COLLATE utf8mb4_unicode_ci
                            AND u.wp_user_id IS NULL)`,
    actual: `SELECT COUNT(*) n FROM \`user\` WHERE wp_user_id IS NOT NULL`,
    explain: "差额=新站已有同名账号(切换前注册)导致的跳过",
    explainSql: `SELECT COUNT(*) n FROM wp_legacy.wp_users w
        WHERE CHAR_LENGTH(w.user_login) <= 32
          AND EXISTS (SELECT 1 FROM \`user\` u
                      WHERE u.username = w.user_login COLLATE utf8mb4_unicode_ci
                        AND u.wp_user_id IS NULL)`,
  },
  {
    id: "points-tx",
    domain: "积分流水",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_myCRED_log l
        JOIN \`user\` u ON u.wp_user_id = l.user_id`,
    actual: `SELECT COUNT(*) n FROM point_transaction WHERE ref_type = 'legacy_wp_mycred'`,
    explain: "无(垃圾户流水按设计跳过,expected 已排除)",
  },
  {
    id: "points-balance",
    domain: "积分余额对账",
    expected: `SELECT 0 n`,
    actual: `SELECT COUNT(*) n FROM (
        SELECT u.id, COALESCE(s.flow_sum, 0) AS flow_sum, CAST(mu.meta_value AS DECIMAL(20)) AS balance
        FROM \`user\` u
        JOIN wp_legacy.wp_usermeta mu ON mu.user_id = u.wp_user_id AND mu.meta_key = 'mycred_default'
        LEFT JOIN (SELECT user_id, SUM(amount) AS flow_sum FROM point_transaction GROUP BY user_id) s
          ON s.user_id = u.id
        HAVING flow_sum <> balance
      ) x`,
    explain: "无(D7 补录后应逐户相等)",
  },
  {
    id: "point-accounts",
    domain: "积分建户",
    expected: `SELECT COUNT(DISTINCT user_id) n FROM point_transaction`,
    actual: `SELECT COUNT(*) n FROM point_account a
        JOIN (SELECT DISTINCT user_id FROM point_transaction) t ON t.user_id = a.user_id`,
    explain: "无(有流水必建户)",
  },
  {
    id: "products",
    domain: "商品",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_posts p
        JOIN (SELECT post_id FROM wp_legacy.wp_postmeta
              WHERE meta_key = '_sku' AND meta_value IS NOT NULL GROUP BY post_id) pm ON pm.post_id = p.ID
        WHERE p.post_type = 'product' AND p.post_status IN ('publish', 'draft')`,
    actual: `SELECT COUNT(*) n FROM product WHERE legacy_wp_product_id IS NOT NULL`,
    explain: "差额=存量商品 SKU 重复(唯一键 ODKU no-op,后一条不落库)",
    explainSql: `SELECT COUNT(*) n FROM (
        SELECT pm.sku FROM wp_legacy.wp_posts p
        JOIN (SELECT post_id, MAX(meta_value) sku FROM wp_legacy.wp_postmeta
              WHERE meta_key = '_sku' GROUP BY post_id) pm ON pm.post_id = p.ID
        WHERE p.post_type = 'product' AND p.post_status IN ('publish', 'draft')
        GROUP BY pm.sku HAVING COUNT(*) > 1
      ) x`,
  },
  {
    id: "orders",
    domain: "订单",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_posts p
        JOIN \`user\` u ON u.wp_user_id = p.post_author
        JOIN (SELECT post_id FROM wp_legacy.wp_postmeta
              WHERE meta_key = '_order_total' GROUP BY post_id) m ON m.post_id = p.ID
        WHERE p.post_type = 'shop_order' AND p.post_status LIKE 'wc-%'`,
    actual: `SELECT COUNT(*) n FROM shop_order WHERE legacy_wp_order_id IS NOT NULL`,
    explain: "无(垃圾户订单按设计跳过,expected 已排除)",
  },
  {
    id: "order-items",
    domain: "订单行",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_woocommerce_order_items oi
        JOIN shop_order o ON o.legacy_wp_order_id = oi.order_id
        JOIN (SELECT order_item_id FROM wp_legacy.wp_woocommerce_order_itemmeta
              WHERE meta_key IN ('_product_id', '_qty', '_line_total', 'acore_item_sku')
              GROUP BY order_item_id) im ON im.order_item_id = oi.order_item_id
        WHERE oi.order_item_type = 'line_item'`,
    actual: `SELECT COUNT(*) n FROM order_item WHERE legacy_wp_order_item_id IS NOT NULL`,
    explain: "无",
  },
  {
    id: "route-map-posts",
    domain: "旧链映射·文章",
    expected: `SELECT COUNT(*) n FROM wp_legacy.wp_posts
        WHERE post_type = 'post' AND post_status = 'publish' AND post_name <> ''`,
    actual: `SELECT COUNT(*) n FROM route_map WHERE old_key LIKE 'p:%'`,
    explain: "无",
  },
  {
    id: "route-map-topics",
    domain: "旧链映射·论坛主题",
    expected: `SELECT COUNT(*) n FROM forum_thread WHERE legacy_wp_topic_id IS NOT NULL`,
    actual: `SELECT COUNT(*) n FROM route_map WHERE old_key LIKE 'topic:%'`,
    explain: "无",
  },
  {
    id: "route-map-boards",
    domain: "旧链映射·论坛版块",
    expected: `SELECT COUNT(*) n FROM forum_board WHERE legacy_wp_forum_id IS NOT NULL`,
    actual: `SELECT COUNT(*) n FROM route_map WHERE old_key LIKE 'forum:%'`,
    explain: "无",
  },
  {
    id: "route-map-page-ids",
    domain: "旧链映射·页面键",
    expected: `SELECT 13 n`,
    actual: `SELECT COUNT(*) n FROM route_map WHERE old_key IN (
        'page_id:2','page_id:135','page_id:1407','page_id:4182',
        'page_id:8','page_id:9','page_id:10','page_id:11','page_id:3949',
        'page_id:2796','page_id:378','page_id:584','page_id:1323')`,
    explain: "无(M3 十三键:4 静态内容页 + 9 功能面页)",
  },
  {
    id: "route-map-tools",
    domain: "旧链映射·六工具页",
    expected: `SELECT 6 n`,
    actual: `SELECT COUNT(*) n FROM route_map WHERE old_key IN (
        'page_id:1287','page_id:1897','page_id:4371','page_id:1880','page_id:537','page_id:1699')`,
    explain: "无(M4 六键 → /online /online-players /playermap /hardcore /banlist /dkp)",
  },
];

async function scalar(pool, sql, params) {
  const [rows] = await pool.query(sql, params);
  return Number(Object.values(rows[0] ?? {})[0] ?? 0);
}

/** 逐域对账。返回 { checks, fail, warn } */
export async function reconcileAll(pool, { mediaPending = false } = {}) {
  const checks = [];

  for (const c of SQL_CHECKS) {
    const expected = await scalar(pool, c.expected);
    const actual = await scalar(pool, c.actual);
    const diff = actual - expected;
    let level = "PASS";
    let note = "";
    if (diff !== 0) {
      const explained = c.explainSql ? await scalar(pool, c.explainSql) : 0;
      if (Math.abs(diff) <= explained) {
        level = "WARN";
        note = `${c.explain}(可解释差额 ${explained})`;
      } else {
        level = "FAIL";
        note = `差额 ${diff > 0 ? "+" : ""}${diff},超出可解释范围 ${explained}`;
      }
    }
    checks.push({ id: c.id, domain: c.domain, expected, actual, diff, level, note });
  }

  // 内容域:复用 content-import 自带的 reconcile(行数对列 + views 对列)
  const content = await contentReconcile(pool);
  // 文章总数 = 仍在 article 的 + 已升格为静态页的教程(升格会删源文章行,不是丢数据)
  const guidePages = await scalar(
    pool,
    `SELECT COUNT(*) n FROM content_page WHERE slug IN (${GUIDE_SLUGS.map(() => "?").join(",")})`,
    GUIDE_SLUGS,
  );
  const articlesTotal = content.articles.imported + guidePages;
  checks.push({
    id: "articles",
    domain: "文章",
    expected: content.articles.wp,
    actual: articlesTotal,
    diff: articlesTotal - content.articles.wp,
    level: content.articles.wp === articlesTotal ? "PASS" : "FAIL",
    note:
      content.articles.wp === articlesTotal
        ? ""
        : `文章数与源不符(article ${content.articles.imported} + 升格教程 ${guidePages})`,
  });
  checks.push({
    id: "article-views",
    domain: "文章阅读数",
    expected: 0,
    actual: content.viewsDiffRows.length,
    diff: content.viewsDiffRows.length,
    level: content.viewsDiffRows.length === 0 ? "PASS" : "FAIL",
    note: content.viewsDiffRows.length === 0 ? "" : "阅读数与 wp_post_views 不符",
  });
  checks.push({
    id: "content-pages",
    domain: "静态页",
    expected: LEGACY_PAGE_IDS.length,
    actual: content.pages,
    diff: content.pages - LEGACY_PAGE_IDS.length,
    level: content.pages === LEGACY_PAGE_IDS.length ? "PASS" : "FAIL",
    note: content.pages === LEGACY_PAGE_IDS.length ? "" : "静态页数与契约(PAGE_MAP + 开发日志)不符",
  });
  checks.push({
    id: "progression-nodes",
    domain: "渐进节点",
    expected: 28,
    actual: content.progressionNodes,
    diff: content.progressionNodes - 28,
    level: content.progressionNodes === 28 ? "PASS" : "FAIL",
    note: content.progressionNodes === 28 ? "" : "渐进节点数与契约(28)不符",
  });

  // 内容域死链:正文里的旧站图 URL 必须已被 image_asset_map 覆盖
  const deadlinks = await scanContentDeadlinks(pool);
  checks.push({
    id: "content-deadlinks",
    domain: "内容域死链",
    expected: 0,
    actual: deadlinks.refs.length,
    diff: deadlinks.refs.length,
    level: deadlinks.refs.length === 0 ? "PASS" : mediaPending ? "WARN" : "FAIL",
    note:
      deadlinks.refs.length === 0
        ? ""
        : mediaPending
          ? "媒体组未跑(image_asset_map 空),旧图 URL 残留属预期态——切换前必须补跑媒体组"
          : "正文残留旧站图 URL 且映射表未覆盖",
  });

  // 论坛域:复用 forum-import 自带的 reconcile(行数对列)
  const forum = await forumReconcile(pool);
  checks.push({
    id: "forum-threads",
    domain: "论坛主题",
    expected: forum.wp.topics,
    actual: forum.db.threads,
    diff: forum.threadsDiff,
    level: forum.threadsDiff === 0 ? "PASS" : "FAIL",
    note: forum.threadsDiff === 0 ? "" : "主题数与源不符",
  });
  checks.push({
    id: "forum-posts",
    domain: "论坛楼层",
    expected: Number(forum.wp.topics) + Number(forum.wp.replies),
    actual: forum.db.posts,
    diff: forum.postsDiff,
    level: forum.postsDiff === 0 ? "PASS" : "FAIL",
    note: forum.postsDiff === 0 ? "" : "楼层数与源不符",
  });

  const fail = checks.filter((c) => c.level === "FAIL").length;
  const warn = checks.filter((c) => c.level === "WARN").length;
  return { checks, fail, warn };
}

/** 打印对账报告 */
export function printReport(result) {
  const width = Math.max(...result.checks.map((c) => c.domain.length));
  console.log("\n迁移对账报告");
  console.log("-".repeat(width + 44));
  for (const c of result.checks) {
    const mark = c.level === "PASS" ? "PASS" : c.level === "WARN" ? "WARN" : "FAIL";
    const line = `${mark.padEnd(4)} ${c.domain.padEnd(width)} 应有 ${String(c.expected).padStart(6)} 实有 ${String(c.actual).padStart(6)}`;
    console.log(c.note ? `${line}  ← ${c.note}` : line);
  }
  console.log("-".repeat(width + 44));
  console.log(`对账结束:FAIL ${result.fail},WARN ${result.warn} → 退出码 ${result.fail > 0 ? 1 : 0}`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const { loadEnv, createPool } = await import("./lib/db.mjs");
  loadEnv();
  const pool = createPool();
  try {
    const result = await reconcileAll(pool, {
      mediaPending: process.env.MIGRATE_MEDIA_PENDING === "1",
    });
    printReport(result);
    process.exitCode = result.fail > 0 ? 1 : 0;
  } finally {
    await pool.end();
  }
}
