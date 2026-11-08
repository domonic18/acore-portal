import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  lintMigrations,
  lintSql,
  readAllowlist,
  splitStatements,
} from "../../scripts/ci/check-migration-idempotency";

const rulesOf = (sql: string) => lintSql(sql, "migration.sql").map((v) => v.rule);

describe("迁移幂等 lint", () => {
  it("R1:CREATE TABLE 缺 IF NOT EXISTS", () => {
    expect(rulesOf("CREATE TABLE `t` (`id` INT);")).toContain("R1");
    expect(rulesOf("CREATE TABLE IF NOT EXISTS `t` (`id` INT);")).not.toContain("R1");
  });

  it("R2:DROP TABLE 缺 IF EXISTS", () => {
    expect(rulesOf("DROP TABLE `t`;")).toContain("R2");
    expect(rulesOf("DROP TABLE IF EXISTS `t`;")).not.toContain("R2");
  });

  it("R3:建索引缺 information_schema 守卫", () => {
    expect(rulesOf("CREATE INDEX `idx_a` ON `t` (`a`);")).toContain("R3");
    expect(
      rulesOf(
        "CREATE PROCEDURE add_idx() BEGIN IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_NAME='t') THEN CREATE INDEX `idx_a` ON `t` (`a`); END IF; END;",
      ),
    ).not.toContain("R3");
  });

  it("R4:ADD COLUMN 缺守卫(MySQL 8.4 无 IF NOT EXISTS)", () => {
    expect(rulesOf("ALTER TABLE `t` ADD COLUMN `c` INT NOT NULL;")).toContain("R4");
    expect(
      rulesOf(
        "ALTER TABLE `t` ADD COLUMN `c` INT NULL, ADD COLUMN `d` INT NULL;",
      ),
    ).toContain("R4");
    // MODIFY/CHANGE 本身可重放,不判违规
    expect(rulesOf("ALTER TABLE `t` MODIFY COLUMN `c` INT NULL;")).not.toContain("R4");
  });

  it("R5:删列/删索引缺守卫", () => {
    expect(rulesOf("ALTER TABLE `t` DROP COLUMN `c`;")).toContain("R5");
    expect(rulesOf("ALTER TABLE `t` DROP INDEX `idx_a`;")).toContain("R5");
  });

  it("R6:INSERT 缺幂等写法", () => {
    expect(rulesOf("INSERT INTO `t` (`a`) VALUES (1);")).toContain("R6");
    expect(rulesOf("INSERT IGNORE INTO `t` (`a`) VALUES (1);")).not.toContain("R6");
    expect(
      rulesOf("INSERT INTO `t` (`a`) VALUES (1) ON DUPLICATE KEY UPDATE `a` = VALUES(`a`);"),
    ).not.toContain("R6");
  });

  it("R7:破坏性语句", () => {
    expect(rulesOf("TRUNCATE TABLE `t`;")).toContain("R7");
    expect(rulesOf("DELETE FROM `t`;")).toContain("R7");
    expect(rulesOf("DELETE FROM `t` WHERE `id` = 1;")).not.toContain("R7");
  });

  it("R8:禁止 DROP DATABASE / DROP SCHEMA", () => {
    expect(rulesOf("DROP DATABASE `x`;")).toContain("R8");
    expect(rulesOf("DROP SCHEMA `x`;")).toContain("R8");
  });

  it("注释行与 `-- guard:` 豁免", () => {
    expect(rulesOf("-- CreateTable\n-- ALTER TABLE `t` ADD COLUMN `c` INT;")).toEqual([]);
    expect(rulesOf("-- guard: 历史迁移保留原样\nALTER TABLE `t` ADD COLUMN `c` INT;")).toEqual([]);
  });

  it("语句切分:跨行语句按 `;` 收尾并记录起始行", () => {
    const stmts = splitStatements("ALTER TABLE `t`\n  ADD COLUMN `c` INT;\nCREATE TABLE `u` (`id` INT);");
    expect(stmts).toHaveLength(2);
    expect(stmts[0]?.line).toBe(1);
    expect(stmts[1]?.line).toBe(3);
  });
});

describe("lintMigrations", () => {
  const makeDir = (name: string, sql: string) => {
    const root = mkdtempSync(join(tmpdir(), "mig-lint-"));
    const dir = join(root, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "migration.sql"), sql);
    return root;
  };

  it("放行名单内的迁移被跳过,名单外的接受检查", () => {
    const root = mkdtempSync(join(tmpdir(), "mig-lint-"));
    mkdirSync(join(root, "old_one"), { recursive: true });
    writeFileSync(join(root, "old_one", "migration.sql"), "CREATE TABLE `t` (`id` INT);");
    mkdirSync(join(root, "new_one"), { recursive: true });
    writeFileSync(join(root, "new_one", "migration.sql"), "CREATE TABLE `u` (`id` INT);");

    const result = lintMigrations(root, new Set(["old_one"]));
    expect(result.skipped).toEqual(["old_one"]);
    expect(result.checked).toEqual(["new_one"]);
    expect(result.violations.map((v) => v.rule)).toEqual(["R1"]);
    expect(result.violations[0]?.file).toContain("new_one");
  });

  it("放行名单里有已不存在的目录时报出来", () => {
    const root = mkdtempSync(join(tmpdir(), "mig-lint-"));
    const result = lintMigrations(root, new Set(["gone"]));
    expect(result.staleAllowlistEntries).toEqual(["gone"]);
  });

  it("readAllowlist 忽略空行与注释", () => {
    const root = mkdtempSync(join(tmpdir(), "mig-lint-"));
    const path = join(root, "allow.txt");
    writeFileSync(path, "# 注释\n\nfoo\nbar\n");
    expect([...readAllowlist(path)]).toEqual(["foo", "bar"]);
  });
});
