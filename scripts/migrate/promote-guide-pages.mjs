// 教程内容升格静态页(2026-11-03 用户反馈⑦):快捷操作类指南从 article
// 升格为 content_page(稳定 slug+根级路由),旧 /post/{slug} 由应用层
// PROMOTED_GUIDE_MAP(see src/constants/content.ts)308 跳转兜底。
//
// 双源策略:article 表有该 slug → 直接复制 bodyMd(生产/测试库已迁);
// 无 → 回源 wp_legacy.wp_posts 按 legacyWpPostId/title 取正文走既有转换管线
// (dev 库 article 只有 seed,须回源)。
//
// 用法:DATABASE_URL=mysql://… node scripts/migrate/promote-guide-pages.mjs
// 幂等:content_page 按 slug upsert;article 删除前先清 tag 关联(级联亦安全)。
import { pathToFileURL } from "node:url";
import { createConverter, normalizeWowheadShortcodes } from "./lib/content-convert.mjs";

const GUIDE_PAGES = [
  {
    slug: "hardcore-mode",
    title: "硬核模式介绍",
    oldSlug: "硬核挑战模式一命模式",
    wpTitle: "【更新通知】硬核挑战(一命)模式上线",
  },
  {
    slug: "mount-guide",
    title: "坐骑掉落与获取指南",
    oldSlug: "魔兽国服关服后错过的坐骑盘点-101款坐骑获取方式",
    wpTitle: "魔兽国服关服后错过的坐骑盘点 101款坐骑获取方式一览",
  },
  {
    slug: "hd-client",
    title: "高清端下载与试用指南",
    oldSlug: "【教程】魔兽世界3-35高清端试用指南",
    wpTitle: "【教程】魔兽世界3.35高清端试用指南",
  },
  {
    slug: "client-extract",
    title: "客户端下载解压方法",
    oldSlug: "客户端下载解压方法",
    wpTitle: "【教程】客户端下载解压方法",
  },
  {
    slug: "login-troubleshoot",
    title: "常见登录问题排查",
    oldSlug: "关于登录不了游戏的排查方法",
    wpTitle: "【教程】登录问题的排查方法",
  },
  {
    slug: "patch-guide",
    title: "补丁说明与生效方法",
    oldSlug: "经验加成合剂显示问号解决方法",
    wpTitle: "【教程】补丁不生效的解决方法",
  },
];

/**
 * 剥离未映射图片(2026-11-03):这 6 篇的配图在 image_asset_map 无映射
 * 且 COS 上不存在(源站文件缺失),保留只会渲染死图;正文文字不受影响。
 */
function stripUnmappedImages(bodyMd) {
  return bodyMd.replace(/!\[[^\]]*\]\((?:https?:\/\/(?:lokta\.cn|www\.lokta\.cn))?\/wp-content\/uploads\/[^)]*\)\n?/g, "");
}

export async function promoteGuidePages(pool) {
  const [imageRows] = await pool.query(
    "SELECT old_url, new_url FROM image_asset_map",
  );
  const imageMap = new Map(imageRows.map((r) => [r.old_url, r.new_url]));
  const toMarkdown = createConverter((wpUrl) => imageMap.get(wpUrl) ?? wpUrl);

  const report = [];
  for (const guide of GUIDE_PAGES) {
    // ① 首选:article 表(已迁正文,含图片重写)
    const [rows] = await pool.execute(
      "SELECT id, body_md FROM article WHERE slug = ? LIMIT 1",
      [guide.oldSlug],
    );
    let bodyMd = null;
    let legacyWpPostId = null;
    if (rows.length > 0) {
      bodyMd = rows[0].body_md;
      legacyWpPostId = null;
    } else {
      // ② 回源 wp_legacy:按精确标题取已发布 post,走同款转换管线
      const [wp] = await pool.query(
        `SELECT ID, post_content FROM wp_legacy.wp_posts
          WHERE post_title = ? AND post_type = 'post' AND post_status = 'publish'
          ORDER BY ID DESC LIMIT 1`,
        [guide.wpTitle],
      );
      if (wp.length === 0) {
        report.push({ slug: guide.slug, action: "MISS_SOURCE", source: "none" });
        continue;
      }
      legacyWpPostId = wp[0].ID;
      bodyMd = normalizeWowheadShortcodes(toMarkdown(wp[0].post_content));
      bodyMd = stripUnmappedImages(bodyMd);
    }

    // ③ upsert 静态页(sortOrder 70+idx,排在核心页之后)
    await pool.execute(
      `INSERT INTO content_page (slug, title, body_md, status, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, 'published', 70, NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE title = VALUES(title), body_md = VALUES(body_md),
         status = 'published', updated_at = NOW(3)`,
      [guide.slug, guide.title, bodyMd],
    );

    // ④ 删源文章(tag 关联级联);article 表没有该行(回源场景)则跳过
    const [del] = await pool.execute("DELETE FROM article WHERE slug = ?", [guide.oldSlug]);

    report.push({
      slug: guide.slug,
      action: rows.length > 0 ? "PROMOTED_FROM_ARTICLE" : "PROMOTED_FROM_WP",
      articleDeleted: del.affectedRows,
      legacyWpPostId,
    });
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createPool } = await import("mysql2/promise");
  const url = new URL(process.env.DATABASE_URL);
  const pool = createPool({
    uri: url.toString(),
    connectionLimit: 4,
    charset: "utf8mb4_0900_ai_ci",
  });
  try {
    const report = await promoteGuidePages(pool);
    console.log("[promote-guide] 完成:");
    for (const row of report) console.log(`  ${row.slug}: ${row.action} (删文章 ${row.articleDeleted})`);
    const missing = report.filter((r) => r.action === "MISS_SOURCE");
    if (missing.length > 0) {
      console.error(`[promote-guide] ${missing.length} 篇缺源,请核对标题映射:`, missing.map((m) => m.slug));
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}
