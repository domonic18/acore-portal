// 存量积分流水导入 + D7 对账补录(US6 T059;quickstart S6.3)
// 前置:wp_legacy 库已导入 WP dump;acore_portal.user 已完成 M1 用户迁移(wp_user_id 映射)
// 幂等键:ref_type='legacy_wp_mycred' + ref_id = wp_myCRED_log.id(data-model §4)
// 口径:
//   * type 映射与 src/constants/points.ts LEGACY_TX_TYPE_MAP 保持一致(mjs 不能引 TS,硬编码同步)
//   * amount 保留正负号(woocommerce_payment 为实扣负数);balance_after=0——存量逐笔余额不可
//     重建,对账以 SUM(amount) 为准(宪法 III 流水为真相源)
//   * M1 未迁垃圾户(>32 login)的流水跳过并计数报告
//   * D7:balance 取存量 wp_usermeta.mycred_default,差额户补 manual_adjust
//     (remark=「迁移对账调整(D7)」),使 SUM(flows)=balance;补录幂等
import { config } from "dotenv";
import { createPool } from "mysql2/promise";
import { pathToFileURL } from "node:url";

const TYPE_MAP = {
  registration: "register_reward",
  badge_reward: "badge_reward",
  woocommerce_payment: "shop_payment",
  manual: "manual_adjust",
  recurring: "recurring",
  visitor_referral: "visitor_referral",
};

/**
 * 导入存量流水(可导入可 CLI)。返回 { imported, skippedNoUser, perRef }。
 */
export async function importPoints(pool) {
  const [known] = await pool.query(
    `SELECT DISTINCT ref FROM wp_legacy.wp_myCRED_log`,
  );
  const unknownRefs = known
    .map((r) => r.ref)
    .filter((ref) => !(ref in TYPE_MAP));
  if (unknownRefs.length > 0) {
    throw new Error(`未知 mycred ref 枚举,先扩展 TYPE_MAP: ${unknownRefs.join(", ")}`);
  }

  // 批量插入:NOT EXISTS 幂等(无 DB 唯一键,迁移为单机单跑,不追求并发安全)
  const [result] = await pool.query(
    `INSERT INTO acore_portal.point_transaction
       (user_id, type, amount, balance_after, remark, ref_type, ref_id, created_at)
     SELECT u.id,
            CASE l.ref
              ${Object.entries(TYPE_MAP)
                .map(([ref, type]) => `WHEN '${ref}' THEN '${type}'`)
                .join(" ")}
            END,
            l.creds,
            0,
            LEFT(l.entry, 255),
            'legacy_wp_mycred',
            l.id,
            FROM_UNIXTIME(l.time)
     FROM wp_legacy.wp_myCRED_log l
     JOIN acore_portal.\`user\` u ON u.wp_user_id = l.user_id
     WHERE NOT EXISTS (
       SELECT 1 FROM acore_portal.point_transaction t
       WHERE t.ref_type = 'legacy_wp_mycred' AND t.ref_id = l.id
     )`,
  );
  const [skipped] = await pool.query(
    `SELECT COUNT(*) n FROM wp_legacy.wp_myCRED_log l
     WHERE NOT EXISTS (SELECT 1 FROM acore_portal.\`user\` u WHERE u.wp_user_id = l.user_id)`,
  );
  const [perRef] = await pool.query(
    `SELECT ref, COUNT(*) n FROM wp_legacy.wp_myCRED_log l
     JOIN acore_portal.\`user\` u ON u.wp_user_id = l.user_id
     GROUP BY ref`,
  );
  return {
    imported: result.affectedRows,
    skippedNoUser: Number(skipped[0].n),
    perRef: Object.fromEntries(perRef.map((r) => [r.ref, Number(r.n)])),
  };
}

/**
 * D7 对账:逐户 SUM(流水) vs 存量 mycred_default,差额补 manual_adjust。
 * runTag 写入审计 payload 供演练对账追踪。返回 { adjustedUsers, totalAdjust, differences }。
 */
export async function reconcileD7(pool, { runTag = new Date().toISOString() } = {}) {
  // 全量重算差异(balance 来自 WP meta;流水 SUM 来自已导行)
  const [diffs] = await pool.query(
    `SELECT u.id user_id, u.wp_user_id, m.balance, COALESCE(s.flow_sum, 0) AS flow_sum
     FROM acore_portal.\`user\` u
     JOIN (SELECT user_id, CAST(meta_value AS DECIMAL(20)) balance
           FROM wp_legacy.wp_usermeta WHERE meta_key = 'mycred_default') m
       ON m.user_id = u.wp_user_id
     LEFT JOIN (SELECT user_id, SUM(amount) AS flow_sum FROM acore_portal.point_transaction GROUP BY user_id) s
       ON s.user_id = u.id
     HAVING flow_sum <> m.balance`,
  );

  let totalAdjust = 0;
  for (const d of diffs) {
    const adjust = Number(d.balance) - Number(d.flow_sum);
    await pool.query(
      `INSERT INTO acore_portal.point_transaction
         (user_id, type, amount, balance_after, remark, ref_type, ref_id)
       VALUES (?, 'manual_adjust', ?, 0, '迁移对账调整(D7)', 'legacy_d7', ?)`,
      [d.user_id, adjust, d.wp_user_id],
    );
    await pool.query(
      `INSERT INTO acore_portal.audit_log (category, action, actor_user_id, payload_json)
       VALUES ('points', 'legacy_d7_adjust', NULL, ?)`,
      [
        JSON.stringify({
          run: runTag,
          userId: String(d.user_id),
          wpUserId: d.wp_user_id,
          flowSum: Number(d.flow_sum),
          legacyBalance: Number(d.balance),
          adjust,
        }),
      ],
    );
    totalAdjust += adjust;
  }
  return { adjustedUsers: diffs.length, totalAdjust, differences: diffs.length };
}

/**
 * 建户物化:point_account.balance = SUM(流水)。对有 mycred_default 的迁移户
 * D7 已保证 SUM=旧站余额,故建户即「以最终积分为准」的落点;缺此步全站余额
 * 显示为空(迁移只导流水不建户)。ODKU 幂等,重跑将物化值与账本重新对齐。
 */
export async function ensurePointAccounts(pool) {
  const [ins] = await pool.query(
    `INSERT INTO acore_portal.point_account (user_id, balance, updated_at)
     SELECT s.user_id, s.total, NOW()
     FROM (SELECT user_id, SUM(amount) AS total
           FROM acore_portal.point_transaction GROUP BY user_id) s
     ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
  );
  const [rows] = await pool.query(`SELECT COUNT(*) n FROM acore_portal.point_account`);
  return { accountsUpserted: ins.affectedRows, accountsTotal: Number(rows[0].n) };
}

// ---- CLI 入口(vitest 导入时不执行) ----
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  config({ path: new URL("../../.env", import.meta.url).pathname });
  const url = new URL(process.env.DATABASE_URL);
  const pool = createPool({
    host: url.hostname,
    port: Number(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 2,
    // 与服务器 UTC 字面量对齐:FROM_UNIXTIME(服务器时区)↔ JS 解析一致,unix 语义还原
    timezone: "+00:00",
  });
  const imported = await importPoints(pool);
  const reconciled = await reconcileD7(pool);
  const accounts = await ensurePointAccounts(pool);
  // 终检:全量重算差异应为 0(HAVING 只认本层 SELECT 别名,不认 JOIN 派生表限定列)
  const [bad] = await pool.query(
    `SELECT COUNT(*) n FROM (
       SELECT u.id, COALESCE(s.flow_sum, 0) AS flow_sum, CAST(mu.meta_value AS DECIMAL(20)) AS balance
       FROM acore_portal.\`user\` u
       JOIN wp_legacy.wp_usermeta mu
         ON mu.user_id = u.wp_user_id AND mu.meta_key = 'mycred_default'
       LEFT JOIN (SELECT user_id, SUM(amount) AS flow_sum FROM acore_portal.point_transaction GROUP BY user_id) s
         ON s.user_id = u.id
       HAVING flow_sum <> balance
     ) x`,
  );
  console.log(
    JSON.stringify(
      { ...imported, ...reconciled, ...accounts, remainingDiffUsers: Number(bad[0].n) },
      null,
      2,
    ),
  );
  await pool.end();
}
