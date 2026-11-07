// 论坛域存量导入(US5 T037;research R4/R16):wp_legacy → acore_portal
//   wp_posts(forum)  → forum_board  (5 版块,slug 固定映射见 lib/forum-convert)
//   wp_posts(topic)  → forum_thread (259 主题:作者映射 wp_user_id+前缀剥离+楼层聚合;
//                      publish/closed 可见,draft/pending/spam/trash 软隐藏数据保留)
//   wp_posts(reply)  → forum_post   (471 楼层:早序 floor 2..n;主贴=主题自身 floor 1)
// 幂等:legacy 键 NOT EXISTS 跳过既有行,可反复执行(与 content-import 同策略)
// 对账:reconcile() 尾部报告(行数对列+作者映射率),CLI 与集成测试共用
// 附注:contentHtml 落库前仅做图片 URL 重写,XSS 白名单收口在渲染层 renderLegacyHtml 单点
import { pathToFileURL } from "node:url";
import {
  BOARD_SLUGS,
  byEarlyOrder,
  floorOfReply,
  MAIN_POST_FLOOR,
  stripStatusPrefix,
  visibleFromStatus,
} from "./lib/forum-convert.mjs";

/** 版块固定定义(wpId → slug;301 依赖稳定 slug,route-map-m3.sql 同源) */
export const BOARD_DEFS = [
  { wpId: 588, slug: "feedback", name: "问题反馈" },
  { wpId: 637, slug: "share", name: "交流分享" },
  { wpId: 1136, slug: "appeal", name: "账号申诉" },
  { wpId: 1264, slug: "report", name: "账号举报" },
  { wpId: 2968, slug: "strategy", name: "攻略专区" },
];

/** image_asset_map 装载为同步 Map(与 content-import 同源管线) */
export async function loadImageMap(pool) {
  const [rows] = await pool.query(
    `SELECT old_url, new_url FROM image_asset_map`,
  );
  return new Map(rows.map((r) => [r.old_url, r.new_url]));
}

/** 存量 HTML 的 <img src> 重写(渲染层 sanitize 前提;未映射保留原 src,死链扫描兜底) */
export function rewriteForumImages(html, imageMap) {
  return (html ?? "").replace(
    /(<img\b[^>]*\bsrc\s*=\s*)(["'])(.*?)\2/gi,
    (_m, lead, quote, src) => {
      const normalized = src.replace(/^https?:\/\/[^/]+/, "");
      const target = imageMap.get(normalized) ?? imageMap.get(src);
      return `${lead}${quote}${target ?? src}${quote}`;
    },
  );
}

/**
 * WP 版块正文 → Markdown 说明(#59 前台 Markdown 白名单管线渲染):
 * <a> 转 md 链接、<br>/</p>/字面 \n 转行、<strong> 保留加粗、其余标签剥壳留内容。
 * 旧站 topic 链接存在 slug 形态(?topic=rule),路由兼容层仅收纯数字键
 * (legacy-routes「不做模糊猜测」),导入期经 slugMap 解析为数字 id。
 */
export function boardDescription(html, slugMap = new Map()) {
  const md = (html ?? "")
    .replace(
      /<a\b[^>]*\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, _quote, href, text) => {
        let url = href;
        const slug = /[?&]topic=([^&#]+)/i.exec(href)?.[1];
        if (slug) {
          const id = slugMap.get(slug.toLowerCase()) ?? slugMap.get(decodeURIComponent(slug).toLowerCase());
          if (id) url = href.replace(/([?&]topic=)[^&#]+/i, `$1${id}`);
        }
        const label = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
        return label ? `[${label}](${url})` : "";
      },
    )
    .replace(/<\/p\s*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag, inner) => `**${inner.replace(/\s+/g, " ").trim()}**`)
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, " ")
    // 字面 \n 文本(旧编辑器残留)并入换行语义;行内空白折叠、行去首尾、丢空行
    .split("\n")
    .map((line) => line.replace(/\\n/g, "").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return md || null;
}

/** 版块导入(幂等:legacy_wp_forum_id 已存在则仅补空/force 重写说明) */
export async function importBoards(pool, { forumIds, forceBoards = false } = {}) {
  const defs = BOARD_DEFS.filter((b) => !forumIds || forumIds.includes(b.wpId));
  const ids = defs.map((b) => b.wpId);
  const [rows, topics] = await Promise.all([
    pool.query(
      `SELECT ID, post_title, post_content FROM wp_legacy.wp_posts
      WHERE post_type = 'forum' AND ID IN (${ids.map(() => "?").join(",")})`,
      ids,
    ).then(([r]) => r),
    pool
      .query(
        `SELECT ID, post_name FROM wp_legacy.wp_posts
         WHERE post_type = 'topic' AND post_name <> ''`,
      )
      .then(([r]) => r),
  ]);
  const slugMap = new Map(
    topics.map((t) => [String(t.post_name).toLowerCase(), Number(t.ID)]),
  );
  let imported = 0;
  let updated = 0;
  for (const [i, def] of defs.entries()) {
    const row = rows.find((r) => r.ID === def.wpId);
    if (!row) continue;
    const description = boardDescription(row.post_content, slugMap);
    const [existing] = await pool.query(
      `SELECT id, description FROM forum_board WHERE legacy_wp_forum_id = ?`,
      [def.wpId],
    );
    if (existing.length > 0) {
      // 空值回补(issue #35);forceBoards 重写压平说明(换行/链接数据修复 #59 后),否则不动后台已改内容
      if (description && (forceBoards || existing[0].description == null)) {
        await pool.query(
          `UPDATE forum_board SET description = ? WHERE id = ?`,
          [description, existing[0].id],
        );
        updated += 1;
      }
      continue;
    }
    await pool.query(
      `INSERT INTO forum_board (slug, name, description, sort, legacy_wp_forum_id)
       VALUES (?, ?, ?, ?, ?)`,
      [def.slug, row.post_title ?? def.name, description, i + 1, def.wpId],
    );
    imported += 1;
  }
  return { scanned: defs.length, imported, updated };
}

/** 主题导入;返回 topicId→threadId 映射(楼层导入用) */
export async function importThreads(pool, { topicIds } = {}) {
  const scope = topicIds?.length
    ? `AND t.ID IN (${topicIds.map(() => "?").join(",")})`
    : "";
  const [topics] = await pool.query(
    `SELECT t.ID, t.post_parent, t.post_title, t.post_author, t.post_status, t.post_date,
            COALESCE(NULLIF(u.display_name, ''), u.user_login, '') AS author,
            (SELECT COUNT(*) FROM wp_legacy.wp_posts r
              WHERE r.post_parent = t.ID AND r.post_type = 'reply'
                AND r.post_status = 'publish') AS reply_count,
            GREATEST(t.post_date, COALESCE(
              (SELECT MAX(r.post_date) FROM wp_legacy.wp_posts r
                WHERE r.post_parent = t.ID AND r.post_type = 'reply'
                  AND r.post_status = 'publish'), t.post_date)) AS last_post_at
       FROM wp_legacy.wp_posts t
       LEFT JOIN wp_legacy.wp_users u ON u.ID = t.post_author
      WHERE t.post_type = 'topic' ${scope}
        AND NOT EXISTS (
          SELECT 1 FROM forum_thread f WHERE f.legacy_wp_topic_id = t.ID
        )`,
    topicIds ?? [],
  );

  // 作者映射:User.wp_user_id(M1 全量 5,643 户);未映射/作者 0(旧站系统帖)保持快照
  const authorIds = [...new Set(topics.map((t) => Number(t.post_author)).filter(Boolean))];
  const userByWpId = new Map();
  if (authorIds.length > 0) {
    const [users] = await pool.query(
      `SELECT id, wp_user_id FROM user WHERE wp_user_id IN (${authorIds
        .map(() => "?")
        .join(",")})`,
      authorIds,
    );
    for (const u of users) userByWpId.set(u.wp_user_id, u.id);
  }

  const [boards] = await pool.query(
    `SELECT id, legacy_wp_forum_id FROM forum_board WHERE legacy_wp_forum_id IS NOT NULL`,
  );
  const boardByWpId = new Map(boards.map((b) => [Number(b.legacy_wp_forum_id), b.id]));

  let imported = 0;
  let mappedAuthors = 0;
  const threadIdByTopic = new Map();
  for (const t of topics) {
    const boardId = boardByWpId.get(Number(t.post_parent));
    if (!boardId) continue; // 孤儿主题(无版块)跳过,对账报告暴露
    const { label, title } = stripStatusPrefix(t.post_title ?? "");
    const visible = visibleFromStatus(t.post_status);
    const authorWpId = Number(t.post_author) || 0;
    const authorUserId = userByWpId.get(authorWpId) ?? null;
    if (authorUserId) mappedAuthors += 1;
    // bbPress closed(回帖锁定)= 历史关闭态:closed_at=主题时间 + statusLabel=closed 保真
    const wpClosed = t.post_status === "closed";
    const statusLabel = wpClosed ? "closed" : label;
    const [res] = await pool.query(
      `INSERT INTO forum_thread
         (board_id, title, author_user_id, author_name, pinned, closed_at, status_label,
          view_count, reply_count, last_post_at, legacy_wp_topic_id, deleted_at,
          created_at, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?, ?, ?, NOW(3))`,
      [
        boardId,
        title,
        authorUserId,
        t.author || "匿名",
        wpClosed ? t.post_date : null,
        statusLabel,
        Number(t.reply_count),
        t.last_post_at,
        t.ID,
        visible ? null : new Date(),
        t.post_date,
      ],
    );
    threadIdByTopic.set(Number(t.ID), Number(res.insertId));
    imported += 1;
  }
  return {
    scanned: topics.length,
    imported,
    mappedAuthors,
    orphanTopics: topics.length - imported,
  };
}

/** 楼层导入(主贴 floor 1 = 主题自身;回复早序 2..n;pending 软隐藏) */
export async function importPosts(pool, { topicIds } = {}) {
  const imageMap = await loadImageMap(pool);
  const scope = topicIds?.length
    ? `AND t.ID IN (${topicIds.map(() => "?").join(",")})`
    : "";
  const [topics] = await pool.query(
    `SELECT t.ID, t.post_author, t.post_date, f.id AS thread_id,
            COALESCE(NULLIF(u.display_name, ''), u.user_login, '') AS author
       FROM wp_legacy.wp_posts t
       JOIN forum_thread f ON f.legacy_wp_topic_id = t.ID
       LEFT JOIN wp_legacy.wp_users u ON u.ID = t.post_author
      WHERE t.post_type = 'topic' ${scope}
        AND NOT EXISTS (
          SELECT 1 FROM forum_post p WHERE p.legacy_wp_post_id = t.ID
        )`,
    topicIds ?? [],
  );
  const ids = topics.map((t) => t.ID);
  const [replies] = ids.length
    ? await pool.query(
        `SELECT r.ID AS id, r.post_date AS created_at, r.post_parent, r.post_author, r.post_status, r.post_content,
                COALESCE(NULLIF(u.display_name, ''), u.user_login, '') AS author
           FROM wp_legacy.wp_posts r
           LEFT JOIN wp_legacy.wp_users u ON u.ID = r.post_author
          WHERE r.post_type = 'reply' AND r.post_parent IN (${ids.map(() => "?").join(",")})
            AND NOT EXISTS (
              SELECT 1 FROM forum_post p WHERE p.legacy_wp_post_id = r.ID
            )`,
        ids,
      )
    : [[]];

  const authorIds = [
    ...new Set(
      [...topics.map((t) => Number(t.post_author)), ...replies.map((r) => Number(r.post_author))].filter(Boolean),
    ),
  ];
  const userByWpId = new Map();
  if (authorIds.length > 0) {
    const [users] = await pool.query(
      `SELECT id, wp_user_id FROM user WHERE wp_user_id IN (${authorIds
        .map(() => "?")
        .join(",")})`,
      authorIds,
    );
    for (const u of users) userByWpId.set(u.wp_user_id, u.id);
  }

  let mainImported = 0;
  for (const t of topics) {
    const [content] = await pool.query(
      `SELECT post_content FROM wp_legacy.wp_posts WHERE ID = ?`,
      [t.ID],
    );
    await pool.query(
      `INSERT INTO forum_post
         (thread_id, floor, author_user_id, author_name, content_html, legacy_wp_post_id,
          deleted_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?, NOW(3))`,
      [
        t.thread_id,
        MAIN_POST_FLOOR,
        userByWpId.get(Number(t.post_author) || 0) ?? null,
        t.author || "匿名",
        rewriteForumImages(content[0]?.post_content ?? "", imageMap),
        t.ID,
        t.post_date,
      ],
    );
    mainImported += 1;
  }

  const byParent = new Map();
  for (const r of replies) {
    const key = Number(r.post_parent);
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(r);
  }
  let replyImported = 0;
  for (const [topicId, rows] of byParent) {
    const thread = topics.find((t) => Number(t.ID) === topicId);
    if (!thread) continue;
    for (const [i, r] of [...rows].sort(byEarlyOrder).entries()) {
      await pool.query(
        `INSERT INTO forum_post
           (thread_id, floor, author_user_id, author_name, content_html, legacy_wp_post_id,
            deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
        [
          thread.thread_id,
          floorOfReply(i),
          userByWpId.get(Number(r.post_author) || 0) ?? null,
          r.author || "匿名",
          rewriteForumImages(r.post_content ?? "", imageMap),
          r.id,
          r.post_status === "publish" ? null : new Date(),
          r.created_at,
        ],
      );
      replyImported += 1;
    }
  }
  return { mainPosts: topics.length, imported: mainImported + replyImported, replies: replyImported };
}

/** 尾部对账:行数对列+作者映射率(SC-201)。db 侧回链 wp_posts(排除 seed/测试
 *  fixture 的 legacy 键行——它们的 wp 源行不存在,JOIN 自然剔除) */
export async function reconcile(pool) {
  const [[wp]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM wp_legacy.wp_posts WHERE post_type = 'forum') AS boards,
       (SELECT COUNT(*) FROM wp_legacy.wp_posts WHERE post_type = 'topic') AS topics,
       (SELECT COUNT(*) FROM wp_legacy.wp_posts WHERE post_type = 'reply') AS replies`,
  );
  const [[db]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM forum_board b
         JOIN wp_legacy.wp_posts w ON w.ID = b.legacy_wp_forum_id AND w.post_type = 'forum') AS boards,
       (SELECT COUNT(*) FROM forum_thread f
         JOIN wp_legacy.wp_posts w ON w.ID = f.legacy_wp_topic_id AND w.post_type = 'topic') AS threads,
       (SELECT COUNT(*) FROM forum_thread f
         JOIN wp_legacy.wp_posts w ON w.ID = f.legacy_wp_topic_id AND w.post_type = 'topic'
        WHERE f.deleted_at IS NULL) AS threads_visible,
       (SELECT COUNT(*) FROM forum_post p
         JOIN wp_legacy.wp_posts w ON w.ID = p.legacy_wp_post_id
         AND w.post_type IN ('topic', 'reply')) AS posts,
       (SELECT COUNT(*) FROM forum_post p
         JOIN wp_legacy.wp_posts w ON w.ID = p.legacy_wp_post_id AND w.post_type IN ('topic', 'reply')
        WHERE p.deleted_at IS NULL) AS posts_visible,
       (SELECT COUNT(*) FROM forum_thread f
         JOIN wp_legacy.wp_posts w ON w.ID = f.legacy_wp_topic_id AND w.post_type = 'topic'
        WHERE f.author_user_id IS NOT NULL) AS mapped_threads,
       (SELECT COUNT(*) FROM forum_post p
         JOIN wp_legacy.wp_posts w ON w.ID = p.legacy_wp_post_id AND w.post_type IN ('topic', 'reply')
        WHERE p.author_user_id IS NOT NULL) AS mapped_posts`,
  );
  return {
    wp: wp,
    db: db,
    threadsDiff: Number(db.threads) - Number(wp.topics),
    // 楼层总数 = 主贴(每主题 1)+ 回复;对列 wp topics+replies
    postsDiff: Number(db.posts) - (Number(wp.topics) + Number(wp.replies)),
  };
}

// ---- CLI 入口(vitest 导入时不执行) ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { loadEnv, createPool } = await import("./lib/db.mjs");
  loadEnv();
  const pool = createPool({ timezone: "+00:00" });
  // --force-boards:重写既有版块说明(换行/链接数据修复后的一次性回填,默认不动后台已改内容)
  const forceBoards = process.argv.includes("--force-boards");
  const boards = await importBoards(pool, { forceBoards });
  const threads = await importThreads(pool);
  const posts = await importPosts(pool);
  const audit = await reconcile(pool);
  console.log(JSON.stringify({ boards, threads, posts, reconcile: audit }, null, 2));
  if (audit.threadsDiff !== 0 || audit.postsDiff !== 0) process.exitCode = 1;
  await pool.end();
}
