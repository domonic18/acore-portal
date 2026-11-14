/**
 * WP 时间口径共享层(2026-11-14 时区对齐)。
 *
 * 背景:WordPress 的 `wp_posts.post_date` / `post_modified` 是**站点本地墙钟**
 * (旧站 timezone_string = Asia/Shanghai),而新站业务库的 DateTime 列是 UTC。
 * 迁移脚本若把 post_date 直接写进 UTC 列,存量数据整体偏 8 小时
 * (北京 00:00–08:00 发的帖会被算到前一天;页面上时间也顺延 8 小时)。
 *
 * 同一瞬时的 UTC 值在 `post_date_gmt` 列里(草稿/待审/自动草稿这几类
 * WP 自己写零值,此时回退 post_date - 8 小时)。
 *
 * 用法:把 SQL 片段拼进查询/更新语句,不要在别处另写一份偏移逻辑。
 */

/** 零值门槛:WP 的 0000-00-00 与任何合理年份比较都小于它 */
const ZERO_DATE_GUARD = "'1980-01-01 00:00:00'";

/**
 * WP 墙钟列 → UTC 值的 SQL 表达式。
 * @param column 墙钟列(带表别名前缀,如 "p.post_date")
 */
export function wpUtcExpr(column) {
  const dot = column.lastIndexOf(".");
  const gmt = dot === -1 ? `${column}_gmt` : `${column.slice(0, dot + 1)}${column.slice(dot + 1)}_gmt`;
  return (
    `CASE WHEN ${gmt} > ${ZERO_DATE_GUARD} THEN ${gmt} ` +
    `ELSE DATE_SUB(${column}, INTERVAL 8 HOUR) END`
  );
}

/**
 * Unix 时间戳 → UTC 字面量(SQL 片段)。
 * FROM_UNIXTIME 按**会话时区**折算,裸用会随连接时区漂移;
 * CONVERT_TZ 显式折回 +00:00,结果与 UTC 列语义一致。
 */
export function unixToUtcExpr(column) {
  return `CONVERT_TZ(FROM_UNIXTIME(${column}), @@session.time_zone, '+00:00')`;
}
