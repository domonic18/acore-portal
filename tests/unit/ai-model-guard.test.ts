import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { AI_SITE_DAILY_TOKEN_MAX_LIMIT } from "@/constants/ai-models";

/**
 * AI 模型注册表口径守卫(2026-11-18 CodeReview 整改):
 * 站点日 Token 上限的默认值散在「代码常量 / Prisma @default / 迁移 DDL DEFAULT」
 * 三处字面量(DDL 没法 import 常量,只能重复),任一处漏改就会让
 * `prisma migrate diff` 报漂移、或让「行缺失时的代码回落」与库里的默认值不一致。
 * 这里把它锁死,并顺带守住上界常量不许再散落字面量。
 */

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, "prisma/schema-business/schema.prisma");
const MIGRATIONS_DIR = path.join(ROOT, "prisma/schema-business/migrations");
const SRC_ROOT = path.join(ROOT, "src");
const CONSTANTS_PATH = path.join(SRC_ROOT, "constants/ai-models.ts");

const DEFAULT = 2_000_000;

function readMigrations(): { file: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => statSync(path.join(MIGRATIONS_DIR, name)).isDirectory())
    .map((name) => ({
      file: name,
      sql: readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf8"),
    }))
    .filter((m) => m.sql.includes("daily_max"))
    .sort((a, b) => a.file.localeCompare(b.file));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "generated") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe("AI 模型注册表默认值口径", () => {
  it("代码常量 = 2,000,000(行缺失时的回落值)", () => {
    // 常量值在常量文件里断言(避免从别处 import 后被误改仍绿)
    const constants = readFileSync(CONSTANTS_PATH, "utf8");
    expect(constants).toMatch(/AI_SITE_DAILY_TOKEN_MAX_DEFAULT\s*=\s*2_000_000/);
  });

  it("Prisma @default 与代码常量一致(零漂移前提)", () => {
    const schema = readFileSync(SCHEMA_PATH, "utf8");
    const line = schema.split("\n").find((l) => l.includes("dailyTokenMax"));
    expect(line).toBeDefined();
    expect(line).toContain(`@default(${DEFAULT})`);
  });

  it("最新一条改 daily_max 的迁移 DDL DEFAULT 与代码常量一致", () => {
    // 取迁移链里最后一条提到 daily_max 的(forward-only,后面的迁移覆盖前面的);
    // 语义翻转前的建表迁移写的是旧「次数」默认值(20),属历史,不由本守卫裁决。
    const migrations = readMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    const latest = migrations[migrations.length - 1]!;
    const defaults = [...latest.sql.matchAll(/DEFAULT\s+(\d+)/g)].map((x) => Number(x[1]));
    expect(defaults.length).toBeGreaterThan(0);
    expect(defaults.every((d) => d === DEFAULT)).toBe(true);
  });
});

describe("AI 模型注册表上界口径", () => {
  it("上界常量为 1,000,000,000", () => {
    expect(AI_SITE_DAILY_TOKEN_MAX_LIMIT).toBe(1_000_000_000);
  });

  it("上界字面量只允许出现在常量文件里(服务端校验与后台表单共用常量)", () => {
    const offenders: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      if (file === CONSTANTS_PATH) continue;
      const source = readFileSync(file, "utf8");
      if (/(?<!\d)1_000_000_000(?!\d)|(?<!\d)1000000000(?!\d)/.test(source)) {
        offenders.push(path.relative(ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
