import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * 迁移时区守卫(2026-11-14):
 * 旧站 WP 的 wp_posts.post_date 是**站点本地墙钟**(Asia/Shanghai),
 * 业务库 DateTime 列语义是 UTC —— 直灌即整体偏 8 小时(且北京 00:00–08:00
 * 的内容会被算到前一天)。迁移脚本必须取 post_date_gmt(零值回退 -8h)。
 *
 * 守卫点:① 迁移脚本不再直接读 post_date 墙钟列;
 *        ② 时间换算口径只写在 lib/time.mjs 一处,不在脚本里另写偏移;
 *        ③ 存量修正脚本存在且幂等(以 wp_legacy 真值回填,不是裸减 8 小时)。
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATE = path.join(ROOT, "scripts", "migrate");
const read = (p: string) => readFileSync(p, "utf8");

describe("迁移脚本的时区口径", () => {
  it("内容/论坛导入用 wpUtcExpr 取 UTC,不再直读 post_date 墙钟列", () => {
    for (const file of ["content-import.mjs", "forum-import.mjs"]) {
      const src = read(path.join(MIGRATE, file));
      expect(src, `${file} 须引入 wpUtcExpr`).toContain("wpUtcExpr");
      // 墙钟列只能出现在 wpUtcExpr(...) 的实参里
      const bare = src.match(/[^.\w]([ptr]\.post_date)\b(?!\s*_gmt)/g) ?? [];
      const outsideExpr = src
        .split("wpUtcExpr(")
        .slice(1)
        .map((chunk) => chunk.split(")")[0]!)
        .join("|");
      const offenders = bare.filter((hit) => !outsideExpr.includes(hit.trim()));
      expect(offenders, `${file} 仍直接读墙钟列: ${offenders.join(", ")}`).toEqual([]);
    }
  });

  it("订单导入取 post_date_gmt,Unix 时间戳显式折回 UTC", () => {
    const shop = read(path.join(MIGRATE, "shop-import.sql"));
    expect(shop).toContain("post_date_gmt");
    expect(shop).toMatch(/CONVERT_TZ\(FROM_UNIXTIME\(/);
    expect(shop).not.toMatch(/THEN p\.post_date END/);
  });

  it("积分流水用 unixToUtcExpr 折回 UTC", () => {
    const points = read(path.join(MIGRATE, "import-points.mjs"));
    expect(points).toContain("unixToUtcExpr");
    expect(points).not.toContain("FROM_UNIXTIME(l.time)");
  });

  it("用户迁移口径正确(user_registered 本就是 GMT,不得做偏移)", () => {
    const users = read(path.join(MIGRATE, "wp-users-import.sql"));
    expect(users).toContain("user_registered");
    expect(users).not.toMatch(/DATE_SUB\(\s*w\.user_registered/);
    expect(users).not.toMatch(/DATE_ADD\(\s*w\.user_registered/);
  });

  it("时间换算口径收在 lib/time.mjs 一处", () => {
    const lib = read(path.join(MIGRATE, "lib", "time.mjs"));
    expect(lib).toContain("export function wpUtcExpr");
    expect(lib).toContain("export function unixToUtcExpr");
    // 偏移常量只在口径层出现一次
    const others = ["content-import.mjs", "forum-import.mjs", "import-points.mjs"].map((f) =>
      read(path.join(MIGRATE, f)),
    );
    for (const src of others) {
      expect(src).not.toMatch(/INTERVAL 8 HOUR/);
      expect(src).not.toMatch(/INTERVAL 8 HOUR/i);
    }
  });
});

describe("存量时间修正脚本", () => {
  const fix = read(path.join(ROOT, "scripts", "ops", "fix-legacy-timezone.sql"));

  it("存在且覆盖四张受影响的表", () => {
    for (const table of ["article", "forum_thread", "forum_post", "shop_order"]) {
      expect(fix).toContain(`\`${table}\``);
    }
  });

  it("以 wp_legacy 真值回填(幂等),不是裸减 8 小时", () => {
    expect(fix).toContain("post_date_gmt");
    expect(fix).not.toMatch(/SET\s+\w+\.\w+\s*=\s*DATE_SUB\(\s*\w+\.\w+,\s*INTERVAL 8 HOUR\s*\)/i);
  });

  it("附核对与复核段(改前/改后都能看差量)", () => {
    expect(fix).toContain("偏移行数");
    expect(fix).toContain("仍偏移行数");
    expect(fix).toContain("孤儿行");
  });
});
