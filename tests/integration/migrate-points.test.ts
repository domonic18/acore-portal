import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { config } from "dotenv";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { ensurePointAccounts, importPoints, reconcileD7 } from "../../scripts/migrate/import-points.mjs";

/**
 * T057 US6 积分存量迁移集成(quickstart S6.3,FR-103/133):
 * 6 类 mycred ref 枚举映射(refType='legacy_wp_mycred'+refId=wp log id 幂等键,
 * amount 保号,balance_after=0 以 SUM 为准);M1 垃圾户(>32 login)流水跳过;
 * D7 对账:balance 取 mycred_default,差额户补 manual_adjust(remark=迁移对账调整(D7)),
 * 全量重算差异=0;重跑零新增(验收红线)。
 */
config({ path: new URL("../../.env", import.meta.url).pathname });

const RUN = Date.now().toString(36);
const USER_A = `t57a${RUN}`;
const USER_B = `t57b${RUN}`;
const USER_SPAM = `t57${RUN}aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`;
const WP_A = 9_700_001;
const WP_B = 9_700_002;
const WP_SPAM = 9_700_003;
const META_A = 9_800_001;
const META_B = 9_800_002;
const BASE_LOG = 9_900_000;

let pool: Pool;
const logIds = Array.from({ length: 13 }, (_, i) => BASE_LOG + i);

async function seedFixture() {
  for (const [wpId, name] of [
    [WP_A, USER_A],
    [WP_B, USER_B],
  ] as const) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_users (ID, user_login, user_pass, user_email, user_registered)
       VALUES (?, ?, '$P$T057hashplaceholder', ?, '2023-02-01 00:00:00')`,
      [wpId, name, `${name}@test.local`],
    );
    await pool.query(
      `INSERT INTO acore_portal.\`user\` (username, email, password_hash, password_algo, wp_user_id, updated_at)
       VALUES (?, ?, '$P$T057hashplaceholder', 'phpass', ?, NOW())`,
      [name, `${name}@test.local`, wpId],
    );
  }
  await pool.query(
    `INSERT INTO wp_legacy.wp_users (ID, user_login, user_pass, user_email, user_registered)
     VALUES (?, ?, '$P$T057hashplaceholder', ?, '2023-02-01 00:00:00')`,
    [WP_SPAM, USER_SPAM, `${USER_SPAM}@test.local`],
  );

  // 用户 A:6 类流水各一(合计 +28);mycred_default=28 → D7 差额 0
  // 用户 B:registration +10;meta 写 12 → D7 补 +2
  // 垃圾户:1 条流水,新站无对应用户 → 跳过并报告
  const rows: [number, number, string, number | null, number, number, string][] = [
    [logIds[0]!, WP_A, "registration", 1, 30, 1_700_000_100, "前30名用户奖励积分"],
    [logIds[1]!, WP_A, "woocommerce_payment", 42, -20, 1_700_000_200, "Payment for Order: #%order_id%"],
    [logIds[2]!, WP_A, "manual", null, 5, 1_700_000_300, "管理员调整"],
    [logIds[3]!, WP_A, "badge_reward", 7, 10, 1_700_000_400, "徽章奖励"],
    [logIds[4]!, WP_A, "recurring", null, 2, 1_700_000_500, "定期发放"],
    [logIds[5]!, WP_A, "visitor_referral", null, 1, 1_700_000_600, "访问推荐"],
    [logIds[6]!, WP_B, "registration", 1, 10, 1_700_000_700, "前30名用户奖励积分"],
    [logIds[7]!, WP_SPAM, "registration", 1, 30, 1_700_000_800, "前30名用户奖励积分"],
  ];
  for (const [id, userId, ref, refId, creds, time, entry] of rows) {
    await pool.query(
      `INSERT INTO wp_legacy.wp_myCRED_log (id, ref, ref_id, user_id, creds, ctype, time, entry, data)
       VALUES (?, ?, ?, ?, ?, 'mycred_default', ?, ?, 'a:0:{}')`,
      [id, ref, refId, userId, creds, time, entry],
    );
  }
  await pool.query(
    `INSERT INTO wp_legacy.wp_usermeta (umeta_id, user_id, meta_key, meta_value)
     VALUES (?, ?, 'mycred_default', '28'), (?, ?, 'mycred_default', '12')`,
    [META_A, WP_A, META_B, WP_B],
  );
}

async function userRows(username: string) {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT t.type, t.amount, t.balance_after, t.remark, t.ref_type, t.ref_id, t.created_at
     FROM acore_portal.point_transaction t
     JOIN acore_portal.\`user\` u ON u.id = t.user_id
     WHERE u.username = ?
     ORDER BY t.ref_type, t.ref_id`,
    [username],
  );
  return rows;
}

beforeAll(async () => {
  const url = new URL(process.env.DATABASE_URL!);
  pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 4,
    timezone: "+00:00",
  });
  await seedFixture();
});

afterAll(async () => {
  const [users] = await pool.query<RowDataPacket[]>(
    `SELECT id FROM acore_portal.\`user\` WHERE username IN (?, ?)`,
    [USER_A, USER_B],
  );
  const ids = (users as { id: number }[]).map((r) => r.id);
  if (ids.length > 0) {
    await pool.query(`DELETE FROM acore_portal.point_transaction WHERE user_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM acore_portal.point_account WHERE user_id IN (?)`, [ids]);
    await pool.query(`DELETE FROM acore_portal.\`user\` WHERE id IN (?)`, [ids]);
  }
  await pool.query(`DELETE FROM acore_portal.audit_log WHERE category = 'points' AND action = 'legacy_d7_adjust' AND payload_json LIKE ?`, [
    `%"run":"${RUN}"%`,
  ]);
  await pool.query(`DELETE FROM wp_legacy.wp_myCRED_log WHERE id IN (?)`, [logIds]);
  await pool.query(`DELETE FROM wp_legacy.wp_usermeta WHERE umeta_id IN (?, ?)`, [META_A, META_B]);
  await pool.query(`DELETE FROM wp_legacy.wp_users WHERE ID IN (?, ?, ?)`, [WP_A, WP_B, WP_SPAM]);
  await pool.end();
});

describe("US6 积分存量迁移(T057)", () => {
  it("首跑:6 类枚举映射/保号/时间还原;垃圾户流水跳过", async () => {
    const report = await importPoints(pool);
    expect(report.skippedNoUser).toBeGreaterThanOrEqual(1);

    const a = await userRows(USER_A);
    expect(a).toHaveLength(6);
    const byRef = new Map(a.map((r) => [Number(r.ref_id), r]));
    expect(byRef.get(logIds[0]!)).toMatchObject({ type: "register_reward", amount: 30 });
    expect(byRef.get(logIds[1]!)).toMatchObject({ type: "shop_payment", amount: -20 });
    expect(byRef.get(logIds[2]!)).toMatchObject({ type: "manual_adjust", amount: 5 });
    expect(byRef.get(logIds[3]!)).toMatchObject({ type: "badge_reward", amount: 10 });
    expect(byRef.get(logIds[4]!)).toMatchObject({ type: "recurring", amount: 2 });
    expect(byRef.get(logIds[5]!)).toMatchObject({ type: "visitor_referral", amount: 1 });
    // 存量行不可重建逐笔余额:balance_after=0,对账以 SUM 为准(D7)
    expect(a.every((r) => Number(r.balance_after) === 0)).toBe(true);
    expect(new Date(byRef.get(logIds[1]!)!.created_at).getTime()).toBe(1_700_000_200 * 1000);

    // 垃圾户无新站用户:流水不得导入
    const [spamHit] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS n FROM acore_portal.point_transaction WHERE ref_id = ?`,
      [logIds[7]!],
    );
    expect(Number(spamHit[0]!.n)).toBe(0);
  });

  it("幂等重跑零新增", async () => {
    const before = await userRows(USER_A);
    await importPoints(pool);
    const after = await userRows(USER_A);
    expect(after).toEqual(before);
  });

  it("D7 对账:差额户补 manual_adjust,重算差异=0;重跑不重复补录", async () => {
    const report = await reconcileD7(pool, { runTag: RUN });
    expect(report.adjustedUsers).toBeGreaterThanOrEqual(1);

    const a = await userRows(USER_A);
    const sumA = a.reduce((s, r) => s + Number(r.amount), 0);
    expect(sumA).toBe(28);
    const b = await userRows(USER_B);
    const sumB = b.reduce((s, r) => s + Number(r.amount), 0);
    expect(sumB).toBe(12);
    const adjust = b.find((r) => r.type === "manual_adjust");
    expect(adjust).toMatchObject({ amount: 2, balance_after: 0, remark: "迁移对账调整(D7)" });

    // 重跑:差异已抹平,不再补录
    const before = await userRows(USER_B);
    const report2 = await reconcileD7(pool, { runTag: `${RUN}x` });
    expect(report2.adjustedUsers).toBe(0);
    expect(await userRows(USER_B)).toEqual(before);
  });

  it("建户物化:point_account.balance=SUM(流水)=旧站余额;重跑对齐", async () => {
    const report = await ensurePointAccounts(pool);
    expect(report.accountsTotal).toBeGreaterThanOrEqual(2);

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT u.username, pa.balance FROM acore_portal.point_account pa
       JOIN acore_portal.\`user\` u ON u.id = pa.user_id WHERE u.username IN (?, ?)`,
      [USER_A, USER_B],
    );
    const balanceByName = new Map(rows.map((r) => [r.username, Number(r.balance)]));
    expect(balanceByName.get(USER_A)).toBe(28);
    expect(balanceByName.get(USER_B)).toBe(12);

    // 重跑 ODKU:物化值与账本重新对齐,不产生重复户
    await ensurePointAccounts(pool);
    const [again] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) n FROM acore_portal.point_account pa
       JOIN acore_portal.\`user\` u ON u.id = pa.user_id WHERE u.username IN (?, ?)`,
      [USER_A, USER_B],
    );
    expect(Number(again[0]!.n)).toBe(2);
  });
});
