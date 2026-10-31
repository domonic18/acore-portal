import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import {
  importBoards,
  importPosts,
  importThreads,
  rewriteForumImages,
} from "../../scripts/migrate/forum-import.mjs";

/**
 * T036 US5 论坛导入集成(quickstart S2,FR-218,SC-201 口径):
 * mini fixture(2 可见主题+1 软隐藏+楼层乱序+未映射作者+图片重写)→
 * 字段保真断言(前缀剥离/closed 双写/作者双字段快照/早序楼层)→
 * 幂等重跑零新增。板行直接 fixture(legacy_wp_forum_id 与真实 588 等隔离)。
 */
config({ path: new URL("../../.env", import.meta.url).pathname });

const BOARD_WP = 9_940_001;
const TOPIC_A = 9_941_001; // publish+【已解决】前缀+映射作者
const TOPIC_B = 9_941_002; // closed(bbPress 锁定)+未映射作者
const TOPIC_C = 9_941_003; // trash → 软隐藏
const REPLY_1 = 9_942_001; // 早
const REPLY_2 = 9_942_002; // 晚
const REPLY_3 = 9_942_003; // pending → 软隐藏
const IMG_OLD = "/wp-content/uploads/2099/01/t36-img.png";
const IMG_NEW = "/2099/01/t36-img.png";

let pool: Pool;

async function seedFixture() {
  await pool.query(
    `INSERT INTO acore_portal.image_asset_map (old_url, new_url) VALUES (?, ?)`,
    [IMG_OLD, IMG_NEW],
  );
  await pool.query(
    `INSERT INTO acore_portal.forum_board (slug, name, sort, legacy_wp_forum_id)
     VALUES ('t36-board', 'T36 版块', 950, ?)`,
    [BOARD_WP],
  );
  const topics: Array<[number, number, string, string, string]> = [
    [TOPIC_A, BOARD_WP, "【已解决】T36 求购附魔材料", "publish", "<p>求购 TaN。</p>"],
    [TOPIC_B, BOARD_WP, "T36 旧签到楼", "closed", "<p>签到。</p>"],
    [TOPIC_C, BOARD_WP, "T36 垃圾桶主题", "trash", "<p>spam。</p>"],
  ];
  for (const [id, parent, title, status, content] of topics) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_posts
         (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_content, post_title, post_status, post_name,
          post_parent, post_type, post_excerpt, to_ping, pinged, post_content_filtered)
       VALUES (?, 1, '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00', '2026-01-01 00:00:00', ?, ?, ?, ?, ?, 'topic', '', '', '', '')`,
      [id, content, title, status, `t36-topic-${id}`, parent],
    );
  }
  const replies: Array<[number, number, string, string, string]> = [
    [REPLY_2, TOPIC_A, "2026-01-03 00:00:00", "publish", `<p>图:<img src="http://lokta.cn${IMG_OLD}" alt="附" /></p>`],
    [REPLY_1, TOPIC_A, "2026-01-02 00:00:00", "publish", "<p>早楼。</p>"],
    [REPLY_3, TOPIC_A, "2026-01-04 00:00:00", "pending", "<p>待审。</p>"],
  ];
  for (const [id, parent, date, status, content] of replies) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_posts
         (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_content, post_title, post_status, post_name,
          post_parent, post_type, post_excerpt, to_ping, pinged, post_content_filtered)
       VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reply', '', '', '', '')`,
      [id, date, date, date, date, content, `T36 回复 ${id}`, status, `t36-reply-${id}`, parent],
    );
  }
}

beforeAll(async () => {
  pool = createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 1,
    timezone: "+00:00",
  });
  await pool.query(`SELECT 1`);
  await cleanFixture();
  await seedFixture();
});

afterAll(async () => {
  await cleanFixture();
  await pool.end();
});

async function cleanFixture() {
  const ids = [TOPIC_A, TOPIC_B, TOPIC_C];
  await pool.query(
    `DELETE p FROM acore_portal.forum_post p
      JOIN acore_portal.forum_thread t ON t.id = p.thread_id
      WHERE t.legacy_wp_topic_id IN (?)`,
    [ids],
  );
  await pool.query(
    `DELETE FROM acore_portal.forum_thread WHERE legacy_wp_topic_id IN (?)`,
    [ids],
  );
  await pool.query(`DELETE FROM acore_portal.forum_board WHERE legacy_wp_forum_id = ?`, [
    BOARD_WP,
  ]);
  await pool.query(`DELETE FROM acore_portal.image_asset_map WHERE old_url = ?`, [IMG_OLD]);
  await pool.query(
    `DELETE FROM wp_legacy.wp_posts WHERE ID BETWEEN 9941000 AND 9942999`,
  );
}

describe("论坛导入(T036/T037)", () => {
  it("主题导入:前缀剥离/closed 双写/软隐藏/作者双字段快照", async () => {
    const res = await importThreads(pool, { topicIds: [TOPIC_A, TOPIC_B, TOPIC_C] });
    expect(res).toMatchObject({ scanned: 3, imported: 3, orphanTopics: 0 });

    const [rows] = (await pool.query(
      `SELECT id, title, author_user_id, author_name, closed_at, status_label,
              deleted_at, reply_count, created_at, last_post_at
         FROM acore_portal.forum_thread WHERE legacy_wp_topic_id IN (?) ORDER BY legacy_wp_topic_id`,
      [[TOPIC_A, TOPIC_B, TOPIC_C]],
    )) as [RowDataPacket[], unknown];
    const a = rows[0]!;
    const b = rows[1]!;
    const c = rows[2]!;
    expect(a.title).toBe("T36 求购附魔材料"); // 【已解决】剥离 → 净标题
    expect(a.status_label).toBe("resolved");
    expect(a.closed_at).toBeNull();
    expect(a.deleted_at).toBeNull();
    expect(a.reply_count).toBe(2); // publish 回复数(pending 不计)
    // last_post_at = 最新可见回复(01-03 晚于主题 01-01)
    expect(new Date(a.last_post_at).toISOString()).toBe("2026-01-03T00:00:00.000Z");
    // b 无回复:last_post_at 回落主题自身时间
    expect(new Date(b.created_at).getTime()).toBe(new Date(b.last_post_at).getTime());

    expect(b.status_label).toBe("closed"); // bbPress closed 历史关闭态保真
    expect(b.closed_at).not.toBeNull();
    expect(b.deleted_at).toBeNull();

    expect(c.status_label).toBe("none");
    expect(c.deleted_at).not.toBeNull(); // trash 软隐藏数据保留
  });

  it("楼层导入:1=主贴+早序连续+pending 软隐藏+图片重写", async () => {
    const res = await importPosts(pool, { topicIds: [TOPIC_A, TOPIC_B, TOPIC_C] });
    expect(res.mainPosts).toBe(3);
    expect(res.replies).toBe(3);

    const [rows] = (await pool.query(
      `SELECT p.floor, p.author_name, p.content_html, p.deleted_at, p.created_at
         FROM acore_portal.forum_post p
         JOIN acore_portal.forum_thread t ON t.id = p.thread_id
        WHERE t.legacy_wp_topic_id = ? ORDER BY p.floor`,
      [TOPIC_A],
    )) as [RowDataPacket[], unknown];
    expect(rows.map((r) => r.floor)).toEqual([1, 2, 3, 4]); // pending 也占位(4)
    const main = rows[0]!;
    const early = rows[1]!;
    const withImg = rows[2]!;
    const pending = rows[3]!;
    expect(main.content_html).toContain("求购 TaN");
    expect(early.content_html).toContain("早楼。"); // 早序:01-02 楼在 01-03 前
    expect(withImg.content_html).toContain(IMG_NEW);
    expect(withImg.content_html).not.toContain(IMG_OLD);
    expect(pending.deleted_at).not.toBeNull(); // pending 软隐藏
  });

  it("幂等重跑零新增", async () => {
    const t = await importThreads(pool, { topicIds: [TOPIC_A, TOPIC_B, TOPIC_C] });
    const p = await importPosts(pool, { topicIds: [TOPIC_A, TOPIC_B, TOPIC_C] });
    expect(t.imported).toBe(0);
    expect(p.imported).toBe(0);
  });

  it("rewriteForumImages 未映射保留原 src;相对路径直接命中", () => {
    const map = new Map([[IMG_OLD, IMG_NEW]]);
    expect(rewriteForumImages(`<img src="http://lokta.cn${IMG_OLD}">`, map)).toContain(IMG_NEW);
    expect(rewriteForumImages(`<img src="${IMG_OLD}">`, map)).toContain(IMG_NEW);
    expect(rewriteForumImages(`<img src="/none/missing.png">`, map)).toContain(
      "/none/missing.png",
    );
  });
});
