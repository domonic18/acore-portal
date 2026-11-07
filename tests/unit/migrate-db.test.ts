import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_SOURCE_SCHEMA,
  resolveDbUrl,
  rewriteSql,
  sourceSchema,
  targetSchema,
} from "../../scripts/migrate/lib/db.mjs";

/**
 * 迁移连接与口径 helper(2026-11-07 迁移就绪度收口):
 * 目标 schema 由连接串推导、源库前缀可配置、两者都缺即报错。
 */
const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe("resolveDbUrl", () => {
  it("MIGRATE_DATABASE_URL 优先于 DATABASE_URL", () => {
    process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/acore_portal";
    process.env.MIGRATE_DATABASE_URL = "mysql://u:p@127.0.0.1:3307/acore_portal_rehearsal";
    expect(resolveDbUrl()).toContain("acore_portal_rehearsal");
  });

  it("只有 DATABASE_URL 时用它", () => {
    delete process.env.MIGRATE_DATABASE_URL;
    process.env.DATABASE_URL = "mysql://u:p@127.0.0.1:3306/acore_portal";
    expect(resolveDbUrl()).toBe("mysql://u:p@127.0.0.1:3306/acore_portal");
  });

  it("两者都缺 → 抛错(绝不猜默认库)", () => {
    delete process.env.MIGRATE_DATABASE_URL;
    delete process.env.DATABASE_URL;
    expect(() => resolveDbUrl()).toThrow(/未配置迁移目标库连接/);
  });
});

describe("targetSchema", () => {
  it("取连接串里的库名", () => {
    expect(targetSchema("mysql://u:p@127.0.0.1:3307/acore_portal_rehearsal")).toBe(
      "acore_portal_rehearsal",
    );
  });

  it("库名带 URL 编码也正确解码", () => {
    expect(targetSchema("mysql://u:p@127.0.0.1:3307/%E4%B8%AD%E6%96%87")).toBe("中文");
  });

  it("未指定库名 → 抛错", () => {
    expect(() => targetSchema("mysql://u:p@127.0.0.1:3307")).toThrow(/无法确定迁移目标 schema/);
  });
});

describe("sourceSchema", () => {
  it("默认 wp_legacy", () => {
    delete process.env.MIGRATE_SOURCE_SCHEMA;
    expect(sourceSchema()).toBe(DEFAULT_SOURCE_SCHEMA);
    expect(DEFAULT_SOURCE_SCHEMA).toBe("wp_legacy");
  });

  it("MIGRATE_SOURCE_SCHEMA 可覆盖", () => {
    process.env.MIGRATE_SOURCE_SCHEMA = "wp_old";
    expect(sourceSchema()).toBe("wp_old");
  });
});

describe("rewriteSql", () => {
  it("默认源库前缀不改写", () => {
    delete process.env.MIGRATE_SOURCE_SCHEMA;
    expect(rewriteSql("SELECT * FROM wp_legacy.wp_posts")).toBe(
      "SELECT * FROM wp_legacy.wp_posts",
    );
  });

  it("覆盖源库时改写前缀(仅限 wp_legacy. 前缀,不动目标表名)", () => {
    process.env.MIGRATE_SOURCE_SCHEMA = "wp_old";
    expect(rewriteSql("SELECT * FROM wp_legacy.wp_posts JOIN `user` ON 1=1")).toBe(
      "SELECT * FROM wp_old.wp_posts JOIN `user` ON 1=1",
    );
  });

  it("不误伤含 wp_legacy 词的表名", () => {
    process.env.MIGRATE_SOURCE_SCHEMA = "wp_old";
    expect(rewriteSql("SELECT * FROM wp_legacy_backup.t")).toBe(
      "SELECT * FROM wp_legacy_backup.t",
    );
  });
});
