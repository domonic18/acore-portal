import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import {
  importArticles,
  importPages,
  importProgression,
  scanContentDeadlinks,
} from "../../scripts/migrate/content-import.mjs";

/**
 * T012 US2 内容导入集成(quickstart S2,FR-208/212/213):
 * mini fixture(3 文章+1 静态页+1 渐进源页,覆盖各分支)→ 跑导入函数 →
 * 行数/字段/幂等重跑零新增/views 列对列一致断言。
 * 作用域导入(postIds/pages 参数)只处理 fixture 行,不触碰真实 111 篇。
 */
config({ path: new URL("../../.env", import.meta.url).pathname });

const POST_A = 9_910_001; // publish+分类83+views=7+映射图+未映射图+wowhead 短代码
const POST_B = 9_910_002; // publish+无分类(回退 announcements)+无 views
const POST_C = 9_910_003; // draft+空 slug(legacy-{id})
const PAGE_X = 9_911_001;
const PROG_PAGE = 9_912_001;
const IMG_OLD = "/wp-content/uploads/2099/01/t12-img.png";
const IMG_NEW = "/2099/01/t12-img.png";
const PAGE_SLUG = "fixture-page-t12";
const PROG_KEYS = ["cp:t12-open", "cp:t12-locked"];

let pool: Pool;

function t12PostAContent() {
  return [
    "<h2>段落标题</h2>",
    `<p>图:<img src="http://lokta.cn${IMG_OLD}" alt="甲图" />`,
    '未映射:<img src="http://lokta.cn/wp-content/uploads/2098/01/none.png" alt="缺" /></p>',
    "<p>掉落 [item=19019]。</p>",
  ].join("");
}

function t12ProgressionHtml() {
  const block = (attrs: Record<string, unknown>) =>
    `<!-- wp:cp-timeline/content-timeline-block-child ${JSON.stringify(attrs)} -->`;
  return [
    block({
      time_heading: "60级阶段 – 初始",
      icon: "FaRegCheckCircle",
      t_date: "2023年1月1日",
      time_desc: "<p>团本:熔火之心</p>",
      timeLineImage: `http://lokta.cn${IMG_OLD}`,
      block_id: "t12-open",
    }),
    block({
      time_heading: "71-74级阶段 – 诺森德开放",
      icon: null,
      t_date: null,
      time_desc: "<p>诺森德。</p>",
      block_id: "t12-locked",
    }),
    block({
      time_heading: "To be continued",
      icon: null,
      t_date: null,
      block_id: "t12-tbc",
    }),
  ].join("\n");
}

async function seedFixture() {
  await pool.query(
    `INSERT INTO acore_portal.image_asset_map (old_url, new_url) VALUES (?, ?)`,
    [IMG_OLD, IMG_NEW],
  );
  const posts: Array<[number, string, string, string, string]> = [
    [POST_A, "t12-a", "【教程】T12 文章甲", "publish", t12PostAContent()],
    [POST_B, "t12-b", "T12 文章乙", "publish", "<p>乙正文,无图无分类。</p>"],
    [POST_C, "", "T12 草稿丙", "draft", "<p>丙草稿。</p>"],
  ];
  for (const [id, name, title, status, content] of posts) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_posts
         (ID, post_author, post_date, post_title, post_content, post_excerpt, post_status, post_name, to_ping, pinged, post_content_filtered, post_type)
       VALUES (?, 1, '2023-06-01 12:00:00', ?, ?, '', ?, ?, '', '', '', 'post')`,
      [id, title, content, status, name],
    );
  }
  // POST_A → 分类 83(news);B/C 无分类
  const [tax] = await pool.query<RowDataPacket[]>(
    `SELECT term_taxonomy_id FROM wp_legacy.wp_term_taxonomy
      WHERE taxonomy = 'category' AND term_id = 83`,
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_term_relationships (object_id, term_taxonomy_id) VALUES (?, ?)`,
    [POST_A, tax[0]!.term_taxonomy_id],
  );
  // POST_A 累计阅读 type=4/total=7;B/C 无行 → 0
  await pool.query(
    `INSERT INTO wp_legacy.wp_post_views (id, type, period, \`count\`) VALUES (?, 4, 'total', 7)`,
    [POST_A],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_posts
       (ID, post_author, post_date, post_title, post_content, post_excerpt, post_status, post_name, to_ping, pinged, post_content_filtered, post_type)
     VALUES (?, 1, '2023-07-01 00:00:00', 'T12 静态页', ?, '', 'publish', 't12-page', '', '', '', 'page')`,
    [PAGE_X, `<p>页面正文。</p><img src="http://lokta.cn${IMG_OLD}" alt="页图" />`],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_posts
       (ID, post_author, post_date, post_title, post_content, post_excerpt, post_status, post_name, to_ping, pinged, post_content_filtered, post_type)
     VALUES (?, 1, '2023-07-02 00:00:00', 'T12 渐进源', ?, '', 'publish', 't12-prog', '', '', '', 'page')`,
    [PROG_PAGE, t12ProgressionHtml()],
  );
}

async function cleanup() {
  await pool.query(
    `DELETE FROM acore_portal.article WHERE legacy_wp_post_id IN (?, ?, ?)`,
    [POST_A, POST_B, POST_C],
  );
  await pool.query(`DELETE FROM acore_portal.content_page WHERE legacy_wp_page_id = ?`, [
    PAGE_X,
  ]);
  await pool.query(
    `DELETE FROM acore_portal.progression_node WHERE legacy_wp_key IN (?, ?)`,
    PROG_KEYS,
  );
  await pool.query(`DELETE FROM acore_portal.image_asset_map WHERE old_url = ?`, [IMG_OLD]);
  await pool.query(`DELETE FROM wp_legacy.wp_posts WHERE ID IN (?, ?, ?, ?, ?)`, [
    POST_A,
    POST_B,
    POST_C,
    PAGE_X,
    PROG_PAGE,
  ]);
  await pool.query(
    `DELETE FROM wp_legacy.wp_term_relationships WHERE object_id IN (?, ?, ?)`,
    [POST_A, POST_B, POST_C],
  );
  await pool.query(`DELETE FROM wp_legacy.wp_post_views WHERE id IN (?, ?, ?)`, [
    POST_A,
    POST_B,
    POST_C,
  ]);
}

async function articleRow(id: number) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT a.slug, a.title, a.excerpt, a.body_md, a.status, a.published_at, a.views,
            c.slug AS category_slug
       FROM acore_portal.article a
       JOIN acore_portal.article_category c ON c.id = a.category_id
      WHERE a.legacy_wp_post_id = ?`,
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 2,
    timezone: "+00:00",
  });
});
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await pool.end();
});

describe("content-import(T012 US2)", () => {
  it("文章导入:字段/views/图片重写/wowhead/无分类回退/草稿态", async () => {
    await seedFixture();

    const r = await importArticles(pool, { postIds: [POST_A, POST_B, POST_C] });
    expect(r.imported).toBe(3);
    expect(r.noCategory).toBe(2);
    expect(r.imageUnmapped).toBe(1);

    const a = await articleRow(POST_A);
    expect(a).toMatchObject({
      slug: "t12-a",
      title: "【教程】T12 文章甲",
      status: "published",
      category_slug: "news",
      views: 7,
    });
    expect(a!.published_at).toBeTruthy();
    expect(a!.body_md).toContain(`![甲图](${IMG_NEW})`);
    expect(a!.body_md).toContain(
      "![缺](http://lokta.cn/wp-content/uploads/2098/01/none.png)",
    );
    expect(a!.body_md).toContain("[item=19019](https://www.wowhead.com/item=19019)");
    expect(a!.excerpt).toContain("[item=19019]");

    const b = await articleRow(POST_B);
    expect(b).toMatchObject({ category_slug: "announcements", views: 0 });

    const c = await articleRow(POST_C);
    expect(c).toMatchObject({ slug: `legacy-${POST_C}`, status: "draft" });
    expect(c!.published_at).toBeNull();

    // 死链扫描(T015):仅未映射图残留;映射图不得出现
    const dead = await scanContentDeadlinks(pool);
    expect(dead.articles).toBe(1);
    expect(dead.pages).toBe(0);
    expect(dead.progressionNodes).toBe(0);
    expect(dead.refs).toEqual([
      {
        table: "article",
        key: "t12-a",
        url: "/wp-content/uploads/2098/01/none.png",
      },
    ]);
  });

  it("幂等重跑零新增(scanned=0 即 NOT EXISTS 生效)", async () => {
    await seedFixture();
    await importArticles(pool, { postIds: [POST_A, POST_B, POST_C] });
    const again = await importArticles(pool, { postIds: [POST_A, POST_B, POST_C] });
    expect(again).toMatchObject({ scanned: 0, imported: 0 });
  });

  it("静态页导入:slug 插入后重跑原位更新不新增", async () => {
    await seedFixture();
    const pages = [{ wpId: PAGE_X, slug: PAGE_SLUG }];
    const first = await importPages(pool, { pages });
    expect(first).toMatchObject({ total: 1, inserted: 1, updated: 0 });
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT body_md FROM acore_portal.content_page WHERE legacy_wp_page_id = ?`,
      [PAGE_X],
    );
    expect(rows[0]!.body_md).toContain(`![页图](${IMG_NEW})`);
    const second = await importPages(pool, { pages });
    expect(second).toMatchObject({ total: 1, inserted: 0, updated: 1 });
  });

  it("渐进导入:开放/未定档/装饰行剔除/图片重写,重跑零新增", async () => {
    await seedFixture();
    const first = await importProgression(pool, { pageId: PROG_PAGE });
    expect(first).toMatchObject({ parsed: 2, imported: 2 });
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT title, phase_date, image_url, body_md, status, sort
         FROM acore_portal.progression_node WHERE legacy_wp_key IN (?, ?) ORDER BY sort`,
      PROG_KEYS,
    );
    expect(rows[0]).toMatchObject({
      title: "60级阶段 – 初始",
      image_url: IMG_NEW,
      body_md: "团本:熔火之心",
      status: "open",
    });
    expect(rows[0]!.phase_date).toBeTruthy();
    expect(rows[1]).toMatchObject({
      title: "71-74级阶段 – 诺森德开放",
      status: "locked",
    });
    expect(rows[1]!.phase_date).toBeNull();

    const again = await importProgression(pool, { pageId: PROG_PAGE });
    expect(again).toMatchObject({ parsed: 2, imported: 0 });
  });
});
