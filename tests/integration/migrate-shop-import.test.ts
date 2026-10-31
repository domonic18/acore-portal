import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";

/**
 * T056 US6 商城存量导入集成(quickstart S6,data-model §7):
 * seed 带标记 WP 形态数据到 wp_legacy → 跑 shop-import.sql →
 * D3 口径:有扣分且金额相符→completed、无扣分→cancelled、金额不符→pending+复核清单;
 * 商品 publish+draft 全量入库(WP 未发布→draft,空 slug 回退 legacy-{ID}),非契约 SKU→draft;
 * 幂等重跑零新增行(legacyWp* 键,验收红线)。
 * seed 的 WP 行/acore 行均带 RUN 标记,用后全清,不污染真实 dump 与演练数据。
 */
config({ path: new URL("../../.env", import.meta.url).pathname });

const RUN = Date.now().toString(36);
const U = `t56${RUN}`;
const SLUG_PREFIX = `m6-${RUN}-`;
const CAT_SLUG_A = `${SLUG_PREFIX}cat-a`;
const CAT_SLUG_B = `${SLUG_PREFIX}cat-b`;
// 大 ID 段避开真实 post ID(非自增列段,手动指定不干扰序列)
const WP_USER_ID = 9_100_001;
const WP_USER_SPAM_ID = 9_100_002;
const TERM_A = 9_200_001;
const TERM_B = 9_200_002;
const TT_B = 9_200_102;
const PRODUCT_WP_IDS = [9_300_001, 9_300_002, 9_300_003, 9_300_004];
const ORDER_WP_IDS = [9_400_001, 9_400_002, 9_400_003];
const ITEM_WP_IDS = [9_500_001, 9_500_002, 9_500_003, 9_500_004];
const GHOST_PRODUCT_WP_ID = 9_300_999; // 不落 wp_posts 的幽灵商品引用
const MYCRED_IDS = [9_600_001, 9_600_002];
const PAID_AT = 1_735_000_000; // 2024-12-24 unix 秒

let pool: Pool;

async function seedWpFixture() {
  // 用户(1 正常+1 超长垃圾户;新站侧仅正常户有 M1 迁移行)
  await pool.query(
    `INSERT INTO wp_legacy.wp_users (ID, user_login, user_pass, user_email, user_registered)
     VALUES (?, ?, '$P$T056hashplaceholder', ?, '2023-01-01 00:00:00'),
            (?, ?, '$P$T056hashplaceholder', ?, '2023-01-01 00:00:00')`,
    [
      WP_USER_ID,
      U,
      `${U}@test.local`,
      WP_USER_SPAM_ID,
      `t56${RUN}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`,
      `spam${U}@test.local`,
    ],
  );
  await pool.query(
    `INSERT INTO acore_portal.\`user\` (username, email, password_hash, password_algo, wp_user_id, updated_at)
     VALUES (?, ?, '$P$T056hashplaceholder', 'phpass', ?, NOW())`,
    [U, `${U}@test.local`, WP_USER_ID],
  );
  // 分类:两枚,验证 slug 幂等键(不造父子层级,映射复杂度留给真实数据)
  await pool.query(
    `INSERT INTO wp_legacy.wp_terms (term_id, name, slug) VALUES
       (?, 'T056 分类A', ?), (?, 'T056 分类B', ?)`,
    [TERM_A, CAT_SLUG_A, TERM_B, CAT_SLUG_B],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_term_taxonomy (term_taxonomy_id, term_id, taxonomy, description, count) VALUES
       (?, ?, 'product_cat', '', 1), (?, ?, 'product_cat', '', 1)`,
    [TERM_A, TERM_A, TT_B, TERM_B],
  );
  // 商品×3:itemsend_ 游戏物品(含促销/库存 meta)、transmog 非契约 SKU、改名服务
  for (const [i, pid] of PRODUCT_WP_IDS.entries()) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_posts (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_content, post_title,
         post_excerpt, to_ping, pinged, post_content_filtered, post_name, post_type, post_status)
       VALUES (?, ?, '2023-05-01 00:00:00', '2023-05-01 00:00:00', '2023-05-01 00:00:00', '2023-05-01 00:00:00', '', ?, '', '', '', '', ?, 'product', 'publish')`,
      [pid, WP_USER_ID, `T056 商品${i} ${RUN}`, `${SLUG_PREFIX}p${i}`],
    );
  }
  const productMeta: [number, string, string][] = [
    [PRODUCT_WP_IDS[0]!, "_sku", "itemsend_906"],
    [PRODUCT_WP_IDS[0]!, "_regular_price", "20"],
    [PRODUCT_WP_IDS[0]!, "_price", "18"],
    [PRODUCT_WP_IDS[0]!, "_sale_price", "18"],
    [PRODUCT_WP_IDS[0]!, "_manage_stock", "yes"],
    [PRODUCT_WP_IDS[0]!, "_stock", "7"],
    [PRODUCT_WP_IDS[1]!, "_sku", "transmog-item_40773"],
    [PRODUCT_WP_IDS[1]!, "_regular_price", "50"],
    [PRODUCT_WP_IDS[1]!, "_price", "50"],
    [PRODUCT_WP_IDS[2]!, "_sku", "char-change-name"],
    [PRODUCT_WP_IDS[2]!, "_regular_price", "150"],
    [PRODUCT_WP_IDS[2]!, "_price", "150"],
  ];
  for (const [pid, k, v] of productMeta) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_postmeta (post_id, meta_key, meta_value) VALUES (?, ?, ?)`,
      [pid, k, v],
    );
  }
  // 商品④:WP draft(未发布)+空 slug(还原存量 2 个 post_name 为空的 draft 形态)
  //   契约 SKU 也必须落 draft;slug 回退 legacy-{postID}
  await pool.query(
    `UPDATE wp_legacy.wp_posts SET post_status = 'draft', post_name = '' WHERE ID = ?`,
    [PRODUCT_WP_IDS[3]],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_postmeta (post_id, meta_key, meta_value) VALUES
       (?, '_sku', ?), (?, '_regular_price', '35'), (?, '_price', '35')`,
    [PRODUCT_WP_IDS[3], `itemsend_t56${RUN}`, PRODUCT_WP_IDS[3], PRODUCT_WP_IDS[3]],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_term_relationships (object_id, term_taxonomy_id) VALUES
       (?, ?), (?, ?)`,
    [PRODUCT_WP_IDS[0]!, TERM_A, PRODUCT_WP_IDS[2]!, TT_B],
  );
  // 行快照指向的商品:③用真实已导入的 char-change-name(seed 同 SKU 行 ODKU no-op)
  // 锚点行历史上由真实导入遗留(legacy id ∉ fixture 段,不被 p=3 断言计入);
  // 沙盒库(重置后)无此行时自足补种(仅缺失才插,已有行不碰,legacy 用 fixture 段外
  // 的 9300100;导入 ODKU 为 no-op 不会改键,行保留作后续运行的稳定锚点)
  await pool.query(
    `INSERT INTO acore_portal.product
       (sku, slug, name, description, type, status, listed, price, category_id, legacy_wp_product_id, created_at, updated_at)
     SELECT 'char-change-name', 'char-change-name', '改名服务', '', 'service', 'published', 1, 150, c.id, 9300100, NOW(), NOW()
     FROM acore_portal.product_category c
     WHERE c.slug = 'general'
       AND NOT EXISTS (SELECT 1 FROM acore_portal.product WHERE sku = 'char-change-name')`,
  );
  const [renameRow] = await pool.query<RowDataPacket[]>(
    `SELECT legacy_wp_product_id AS id FROM acore_portal.product WHERE sku = 'char-change-name' LIMIT 1`,
  );
  const renameWpId = Number(renameRow[0]!.id);

  // 订单×3(全部 wc-processing,判据走 D3 而非 post_status):
  // ①扣分 20=金额 20→completed ②无扣分→cancelled(含幽灵商品行) ③扣分 45≠金额 50→pending+复核
  const orders: {
    id: number;
    total: string;
    title: string;
    cred?: number;
    productId: number;
    guid?: string;
  }[] = [
    {
      id: ORDER_WP_IDS[0]!,
      total: "20",
      title: "T056 订单-相符",
      cred: -20,
      productId: PRODUCT_WP_IDS[0]!,
      guid: "123456",
    },
    { id: ORDER_WP_IDS[1]!, total: "30", title: "T056 订单-无扣分", productId: PRODUCT_WP_IDS[0]! },
    {
      id: ORDER_WP_IDS[2]!,
      total: "50",
      title: "T056 订单-不符",
      cred: -45,
      productId: renameWpId,
      guid: "654321",
    },
  ];
  for (const o of orders) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_posts (ID, post_author, post_date, post_date_gmt, post_modified, post_modified_gmt, post_content, post_title,
         post_excerpt, to_ping, pinged, post_content_filtered, post_name, post_type, post_status)
       VALUES (?, ?, '2023-06-01 12:00:00', '2023-06-01 12:00:00', '2023-06-01 12:00:00', '2023-06-01 12:00:00', '', ?, '', '', '', '', ?, 'shop_order', 'wc-processing')`,
      [o.id, WP_USER_ID, o.title, `order-${o.id}`],
    );
    await pool.query(
      `INSERT INTO wp_legacy.wp_postmeta (post_id, meta_key, meta_value) VALUES (?, '_order_total', ?)`,
      [o.id, o.total],
    );
    if (o.cred !== undefined) {
      await pool.query(
        `INSERT INTO wp_legacy.wp_myCRED_log (id, ref, ref_id, user_id, creds, ctype, time, entry, data)
         VALUES (?, 'woocommerce_payment', ?, ?, ?, 'mycred_default', ?, 'Payment for Order', 'a:0:{}')`,
        [o.id === ORDER_WP_IDS[0]! ? MYCRED_IDS[0]! : MYCRED_IDS[1]!, o.id, WP_USER_ID, o.cred, PAID_AT],
      );
    }
    const itemIdx = orders.indexOf(o);
    await pool.query(
      `INSERT INTO wp_legacy.wp_woocommerce_order_items
         (order_item_id, order_item_name, order_item_type, order_id)
       VALUES (?, '行快照名', 'line_item', ?)`,
      [ITEM_WP_IDS[itemIdx]!, o.id],
    );
    await pool.query(
      `INSERT INTO wp_legacy.wp_woocommerce_order_itemmeta
         (order_item_id, meta_key, meta_value) VALUES
         (?, '_product_id', ?), (?, '_qty', '1'), (?, '_line_total', ?)${o.guid ? `, (?, 'acore_char_guid', ?)` : ""}`,
      o.guid
        ? [ITEM_WP_IDS[itemIdx]!, o.productId, ITEM_WP_IDS[itemIdx]!, ITEM_WP_IDS[itemIdx]!, o.total, ITEM_WP_IDS[itemIdx]!, o.guid]
        : [ITEM_WP_IDS[itemIdx]!, o.productId, ITEM_WP_IDS[itemIdx]!, ITEM_WP_IDS[itemIdx]!, o.total],
    );
  }
  // 订单②追加幽灵商品行:引用不存在的 post(旧站已删除商品的存量形态),行快照应落占位商品
  await pool.query(
    `INSERT INTO wp_legacy.wp_woocommerce_order_items
       (order_item_id, order_item_name, order_item_type, order_id)
     VALUES (?, '幽灵行快照', 'line_item', ?)`,
    [ITEM_WP_IDS[3], ORDER_WP_IDS[1]],
  );
  await pool.query(
    `INSERT INTO wp_legacy.wp_woocommerce_order_itemmeta
       (order_item_id, meta_key, meta_value) VALUES
       (?, '_product_id', ?), (?, '_qty', '2'), (?, '_line_total', '30')`,
    [ITEM_WP_IDS[3], GHOST_PRODUCT_WP_ID, ITEM_WP_IDS[3], ITEM_WP_IDS[3]],
  );
}

async function runShopImport() {
  const sql = readFileSync(
    path.join(import.meta.dirname, "../../scripts/migrate/shop-import.sql"),
    "utf8",
  );
  await pool.query(sql);
}

async function counts(): Promise<Record<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM acore_portal.product_category) AS category,
      (SELECT COUNT(*) FROM acore_portal.product) AS product,
      (SELECT COUNT(*) FROM acore_portal.shop_order) AS shop_order,
      (SELECT COUNT(*) FROM acore_portal.order_item) AS order_item,
      (SELECT COUNT(*) FROM acore_portal.migration_review_item) AS review`);
  const r = rows[0] as Record<string, number>;
  return r;
}

async function seedRows() {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT
      (SELECT COUNT(*) FROM acore_portal.product WHERE legacy_wp_product_id IN (?)) AS p,
      (SELECT COUNT(*) FROM acore_portal.shop_order WHERE legacy_wp_order_id IN (?)) AS o,
      (SELECT COUNT(*) FROM acore_portal.order_item WHERE legacy_wp_order_item_id IN (?)) AS oi`,
    [PRODUCT_WP_IDS, ORDER_WP_IDS, ITEM_WP_IDS],
  );
  return rows[0] as { p: number; o: number; oi: number };
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    multipleStatements: true,
    connectionLimit: 4,
    timezone: "+00:00",
  });
  await seedWpFixture();
});

afterAll(async () => {
  // acore 侧:复核→行→单→商品→分类→用户(FK 依赖序)
  await pool.query(`DELETE FROM acore_portal.migration_review_item WHERE legacy_wp_order_id IN (?)`, [ORDER_WP_IDS]);
  await pool.query(`DELETE FROM acore_portal.order_item WHERE legacy_wp_order_item_id IN (?)`, [ITEM_WP_IDS]);
  await pool.query(`DELETE FROM acore_portal.shop_order WHERE legacy_wp_order_id IN (?)`, [ORDER_WP_IDS]);
  await pool.query(`DELETE FROM acore_portal.product WHERE legacy_wp_product_id IN (?)`, [PRODUCT_WP_IDS]);
  await pool.query(`DELETE FROM acore_portal.product_category WHERE slug IN (?, ?)`, [CAT_SLUG_A, CAT_SLUG_B]);
  await pool.query(`DELETE FROM acore_portal.\`user\` WHERE username = ?`, [U]);
  // wp 侧
  const postIds = [...PRODUCT_WP_IDS, ...ORDER_WP_IDS];
  await pool.query(`DELETE FROM wp_legacy.wp_woocommerce_order_itemmeta WHERE order_item_id IN (?)`, [ITEM_WP_IDS]);
  await pool.query(`DELETE FROM wp_legacy.wp_woocommerce_order_items WHERE order_item_id IN (?)`, [ITEM_WP_IDS]);
  await pool.query(`DELETE FROM wp_legacy.wp_myCRED_log WHERE id IN (?)`, [MYCRED_IDS]);
  await pool.query(`DELETE FROM wp_legacy.wp_postmeta WHERE post_id IN (?)`, [postIds]);
  await pool.query(`DELETE FROM wp_legacy.wp_term_relationships WHERE object_id IN (?)`, [PRODUCT_WP_IDS]);
  await pool.query(`DELETE FROM wp_legacy.wp_posts WHERE ID IN (?)`, [postIds]);
  await pool.query(`DELETE FROM wp_legacy.wp_term_taxonomy WHERE term_taxonomy_id IN (?, ?)`, [TERM_A, TT_B]);
  await pool.query(`DELETE FROM wp_legacy.wp_terms WHERE term_id IN (?, ?)`, [TERM_A, TERM_B]);
  await pool.query(`DELETE FROM wp_legacy.wp_users WHERE ID IN (?, ?)`, [WP_USER_ID, WP_USER_SPAM_ID]);
  await pool.end();
});

describe("US6 商城存量导入(T056)", () => {
  it("首跑:分类/商品/订单按 D3 口径落库,行快照含角色还原", async () => {
    await runShopImport();

    const seeded = await seedRows();
    expect(seeded).toEqual({ p: 3, o: 3, oi: 4 }); // p=3:char-change-name 与真实导入商品撞 SKU,ODKU no-op

    // 分类(slug 幂等键)
    const [cats] = await pool.query<RowDataPacket[]>(
      `SELECT slug, name FROM acore_portal.product_category WHERE slug IN (?, ?) ORDER BY slug`,
      [CAT_SLUG_A, CAT_SLUG_B],
    );
    expect(cats.map((c) => c.slug)).toEqual([CAT_SLUG_A, CAT_SLUG_B]);

    // 商品①:itemsend_ 游戏物品→published,促销价/库存/gameItemId 还原
    const [p1] = await pool.query<RowDataPacket[]>(
      `SELECT type, sku, name, status, price, sale_price, stock_enabled, stock, low_stock_threshold,
              game_item_id, legacy_wp_product_id
       FROM acore_portal.product WHERE legacy_wp_product_id = ?`,
      [PRODUCT_WP_IDS[0]],
    );
    expect(p1[0]!).toMatchObject({
      type: "game_item",
      sku: "itemsend_906",
      status: "published",
      price: 20,
      sale_price: 18,
      stock_enabled: 1,
      stock: 7,
      low_stock_threshold: 1,
      game_item_id: 906,
    });

    // 商品②:transmog 非契约 SKU→draft 不阻塞
    const [p2] = await pool.query<RowDataPacket[]>(
      `SELECT type, status, game_item_id FROM acore_portal.product WHERE legacy_wp_product_id = ?`,
      [PRODUCT_WP_IDS[1]],
    );
    expect(p2[0]!).toMatchObject({ type: "game_item", status: "draft" });

    // 商品④:WP 未发布→draft(契约 SKU 也不例外);空 post_name 回退 legacy-{ID}
    const [p4] = await pool.query<RowDataPacket[]>(
      `SELECT type, status, slug FROM acore_portal.product WHERE legacy_wp_product_id = ?`,
      [PRODUCT_WP_IDS[3]],
    );
    expect(p4[0]!).toMatchObject({
      type: "game_item",
      status: "draft",
      slug: `legacy-${PRODUCT_WP_IDS[3]}`,
    });

    // 商品③:已知服务键→published(真实 dump 同名 SKU 先导,seed 行 ODKU no-op,按 SKU 断言)
    const [p3] = await pool.query<RowDataPacket[]>(
      `SELECT type, status, sku FROM acore_portal.product WHERE sku = 'char-change-name'`,
    );
    expect(p3[0]).toMatchObject({ type: "service", sku: "char-change-name", status: "published" });

    // 订单①:扣分相符→completed,paidAt=扣分流水时刻
    const [o1] = await pool.query<RowDataPacket[]>(
      `SELECT order_no, status, point_cost, paid_at, completed_at, legacy_wp_order_id
       FROM acore_portal.shop_order WHERE legacy_wp_order_id = ?`,
      [ORDER_WP_IDS[0]],
    );
    expect(o1[0]).toMatchObject({
      order_no: `WP${ORDER_WP_IDS[0]}`,
      status: "completed",
      point_cost: 20,
      legacy_wp_order_id: ORDER_WP_IDS[0],
    });
    expect(new Date(o1[0]!.paid_at).getTime()).toBe(PAID_AT * 1000);

    // 行快照:sku/名称/单价/qty/角色还原/completed 单行=delivered
    const [i1] = await pool.query<RowDataPacket[]>(
      `SELECT sku, name, unit_price, qty, params, delivery_status
       FROM acore_portal.order_item WHERE legacy_wp_order_item_id = ?`,
      [ITEM_WP_IDS[0]],
    );
    expect(i1[0]!).toMatchObject({
      sku: "itemsend_906",
      name: "行快照名",
      unit_price: 20,
      qty: 1,
      delivery_status: "delivered",
    });
    expect(i1[0]!.params).toEqual({ characterGuid: 123456 }); // mysql2 已解析 JSON 列

    // 订单②:无扣分→cancelled
    const [o2] = await pool.query<RowDataPacket[]>(
      `SELECT status, cancelled_at FROM acore_portal.shop_order WHERE legacy_wp_order_id = ?`,
      [ORDER_WP_IDS[1]],
    );
    expect(o2[0]!.status).toBe("cancelled");
    expect(o2[0]!.cancelled_at).not.toBeNull();

    // 订单③:金额不符→pending+复核清单(detail 记录两口径)
    const [o3] = await pool.query<RowDataPacket[]>(
      `SELECT status FROM acore_portal.shop_order WHERE legacy_wp_order_id = ?`,
      [ORDER_WP_IDS[2]],
    );
    expect(o3[0]!.status).toBe("pending");
    const [rv] = await pool.query<RowDataPacket[]>(
      `SELECT reason, detail FROM acore_portal.migration_review_item WHERE legacy_wp_order_id = ?`,
      [ORDER_WP_IDS[2]],
    );
    expect(rv[0]!.reason).toBe("amount_mismatch");
    expect(rv[0]!.detail).toEqual({ paid: 45, expected: 50 });

    // 订单②行:取消单行保持 pending(永不驱动)
    const [i2] = await pool.query<RowDataPacket[]>(
      `SELECT delivery_status FROM acore_portal.order_item WHERE legacy_wp_order_item_id = ?`,
      [ITEM_WP_IDS[1]],
    );
    expect(i2[0]!.delivery_status).toBe("pending");

    // 订单②幽灵行:商品 post 不存在→落 legacy-deleted 占位(draft/hidden),行名/数量/单价保留
    const [ig] = await pool.query<RowDataPacket[]>(
      `SELECT oi.sku, oi.name, oi.unit_price, oi.qty, oi.delivery_status, p.status p_status, p.listed
       FROM acore_portal.order_item oi
       JOIN acore_portal.product p ON p.id = oi.product_id
       WHERE oi.legacy_wp_order_item_id = ?`,
      [ITEM_WP_IDS[3]],
    );
    expect(ig[0]!).toMatchObject({
      sku: "legacy-deleted",
      name: "幽灵行快照",
      unit_price: 15,
      qty: 2,
      delivery_status: "pending",
      p_status: "draft",
      listed: 0,
    });
  });

  it("幂等重跑零新增行(legacyWp* 键,验收红线)", async () => {
    const before = await counts();
    await runShopImport();
    const after = await counts();
    expect(after).toEqual(before);
    const seeded = await seedRows();
    expect(seeded).toEqual({ p: 3, o: 3, oi: 4 });
    // D3 复核清单同样幂等
    const [rv] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM acore_portal.migration_review_item WHERE legacy_wp_order_id = ?`,
      [ORDER_WP_IDS[2]],
    );
    expect(Number(rv[0]!.n)).toBe(1);
  });
});
