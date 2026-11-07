// 迁移脚本统一连接与口径入口(2026-11-07 迁移就绪度收口):
//
// 收口三件事,每个都对应一类切换日事故:
// 1. **目标库只有一处真相**:目标 schema 一律从连接串库名推导(DATABASE_URL 指向哪个库
//    就迁到哪个库),脚本里不再出现 `acore_portal.` 字面量。此前字面量写死意味着
//    「连接串指 acore_portal_e2e、SQL 却写进 acore_portal」——E2E 隔离 schema 纪律
//    对迁移脚本完全失效,演练数据会污染 dev 真库。
// 2. **源库前缀可配置**:源库统一叫 wp_legacy(可 MIGRATE_SOURCE_SCHEMA 覆盖),
//    运行时改写,不再散落字面量。
// 3. **连接口径一处收敛**:所有迁移脚本用同一套 env 加载(DATABASE_URL/MIGRATE_DATABASE_URL
//    优先级)、同一套 charset/时区。此前 slug-normalize.mjs 硬编码默认连 3308(测试栈),
//    漏传 env 就会静默打到错误的库。
//
// 目标库表名一律**不带库名前缀**(由连接的默认库解析),源库表名带库名前缀。
// 手工跑 .sql 文件也必须选中目标库:mysql <目标库> < xxx.sql。
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as dotenvConfig } from "dotenv";
import mysql from "mysql2/promise";

/** 源库默认 schema(WP 存档库;生产切换期须与新库同实例) */
export const DEFAULT_SOURCE_SCHEMA = "wp_legacy";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const ENV_PATH = path.join(REPO_ROOT, ".env");

/**
 * 加载仓库根 .env(不覆盖已存在的环境变量)。
 * 迁移脚本历史上半数自加载半数不加载 → 同一链上不同脚本连到不同库的经典事故源。
 */
export function loadEnv() {
  dotenvConfig({ path: ENV_PATH });
  return ENV_PATH;
}

/**
 * 目标库连接串:MIGRATE_DATABASE_URL 优先(演练/隔离 schema 用),否则 DATABASE_URL。
 * 两者都缺 → 直接抛错,绝不猜默认值(猜错库 = 把迁移数据写进错误的库)。
 */
export function resolveDbUrl() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "未配置迁移目标库连接。设置 MIGRATE_DATABASE_URL(优先)或 DATABASE_URL," +
        "例:mysql://acore_portal:***@127.0.0.1:3307/acore_portal_rehearsal",
    );
  }
  return url;
}

/** 目标 schema = 连接串里的库名(迁移脚本里所有不带前缀的表都解析到它) */
export function targetSchema(url = resolveDbUrl()) {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ""));
  if (!name) throw new Error(`连接串未指定库名,无法确定迁移目标 schema:${url}`);
  return name;
}

/** 源库 schema:MIGRATE_SOURCE_SCHEMA 覆盖,默认 wp_legacy */
export function sourceSchema() {
  return process.env.MIGRATE_SOURCE_SCHEMA ?? DEFAULT_SOURCE_SCHEMA;
}

/**
 * SQL 改写:源库前缀 → 当前 sourceSchema。
 * 目标库不写前缀(由连接的默认库解析),故此处不动目标表名。
 */
export function rewriteSql(sql) {
  const src = sourceSchema();
  if (src === DEFAULT_SOURCE_SCHEMA) return sql;
  return sql.replace(/\bwp_legacy\./g, `${src}.`);
}

function poolConfig(url, options) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    // 默认库 = 目标 schema:不带前缀的表名一律解析到它
    database: targetSchema(url),
    connectionLimit: options.connectionLimit ?? 2,
    charset: options.charset ?? "utf8mb4",
    ...(options.timezone ? { timezone: options.timezone } : {}),
    ...(options.multipleStatements ? { multipleStatements: true } : {}),
  };
}

/** 给 pool/connection 的 query/execute 套上源库前缀改写 */
function withSqlRewrite(client) {
  const rawQuery = client.query.bind(client);
  client.query = (sql, params) => rawQuery(rewriteSql(sql), params);
  if (client.execute) {
    const rawExecute = client.execute.bind(client);
    client.execute = (sql, params) => rawExecute(rewriteSql(sql), params);
  }
  return client;
}

/** 迁移统一连接池:目标库 = 连接串库名,源库前缀运行时改写 */
export function createPool(options = {}) {
  const url = resolveDbUrl();
  return withSqlRewrite(mysql.createPool(poolConfig(url, options)));
}

/** 迁移统一单连接(短脚本用)。mysql2/promise 的 createConnection 返回 Promise,须 await 后再包装 */
export async function createConnection(options = {}) {
  const url = resolveDbUrl();
  const conn = await mysql.createConnection(poolConfig(url, options));
  return withSqlRewrite(conn);
}

/**
 * 执行一个 .sql 文件(多条语句)。
 * 迁移链里的 SQL 文件按顺序拼在一处执行,任一语句报错即整体失败。
 */
export async function runSqlFile(sql, options = {}) {
  const conn = await createConnection({ ...options, multipleStatements: true });
  try {
    return await conn.query(rewriteSql(sql));
  } finally {
    await conn.end();
  }
}
