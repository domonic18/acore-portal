// shop slug 归一(切换日管线步骤 ②b,紧跟 shop-import.sql 之后):
// WP 原生 slug 为百分号编码形态(M2 SQL 导入无 urldecode 能力,原样入库),
// 而 M3 文章管线已 decodeURIComponent 入库——两域口径分裂导致 C 端链接
// 裸模板/encodeURIComponent 两种拼法只有一半碰巧可达。本脚本把
// product_category.slug / product.slug 解码为中文明文,对齐 M3。
// 消费端契约:动态路由 params 需 decodeURIComponent(post/[slug] 先例)。
// 幂等:二跑无 %xx 模式即零更新。冲突(解码后撞已有 slug)跳过并报告,不猜后缀。
// 用法:node slug-normalize.mjs [--dry-run]
import mysql from "mysql2/promise";

const dryRun = process.argv.includes("--dry-run");
// .env 恒指 dev 3307;测试栈演练一律内联覆盖 3308(与 import-points.mjs 同口径)
process.env.DATABASE_URL =
  process.env.MIGRATE_DATABASE_URL ??
  "mysql://root:root@127.0.0.1:3308/acore_portal";

const PCT = /%[0-9a-f]{2}/i;
const UNSAFE = /[%/#?&+\s]/;

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const summary = {};

for (const table of ["product_category", "product"]) {
  const [rows] = await conn.query(`SELECT id, slug FROM ${table}`);
  // 既有未编码 slug 作为撞库基线(ci 口径对齐 utf8mb4_0900_ai_ci 唯一索引)
  const taken = new Map(
    rows.filter((r) => !PCT.test(r.slug)).map((r) => [r.slug.toLowerCase(), r.id]),
  );
  const updates = [];
  const skipped = [];
  for (const r of rows) {
    if (!PCT.test(r.slug)) continue;
    let decoded;
    try {
      decoded = decodeURIComponent(r.slug);
    } catch {
      skipped.push({ id: r.id, slug: r.slug, reason: "decode-error" });
      continue;
    }
    if (!decoded || decoded === r.slug) continue;
    if (UNSAFE.test(decoded)) {
      skipped.push({ id: r.id, slug: r.slug, reason: `unsafe:${decoded}` });
      continue;
    }
    const key = decoded.toLowerCase();
    if (taken.has(key)) {
      skipped.push({ id: r.id, slug: r.slug, reason: `dup:${taken.get(key)}` });
      continue;
    }
    taken.set(key, r.id);
    updates.push({ id: r.id, from: r.slug, to: decoded });
  }
  if (!dryRun) {
    for (const u of updates) {
      await conn.execute(`UPDATE ${table} SET slug = ? WHERE id = ?`, [u.to, u.id]);
    }
  }
  summary[table] = { total: rows.length, updated: updates.length, skipped };
}

await conn.end();
console.log(JSON.stringify({ dryRun, ...summary }, null, 2));
