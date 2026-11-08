#!/usr/bin/env tsx
/**
 * 迁移幂等静态检查(MySQL 8.4 口径)
 *
 * 为什么要有:Prisma 的 `migrate deploy` 靠 `_prisma_migrations` ledger 保证不重放,
 * 但 **MySQL DDL 非事务**——迁移中途失败会留下半截 schema + ledger 的 failed 行,
 * 之后 `migrate deploy` 直接拒绝继续,只能人工 `migrate resolve --rolled-back` 后
 * **手工重放该迁移 SQL**。因此新迁移必须写成「重放安全」的形态。
 *
 * 规则按 MySQL 口径(MySQL 8.4 不支持 `CREATE INDEX IF NOT EXISTS` /
 * `ALTER TABLE ADD COLUMN IF NOT EXISTS` / `DROP INDEX IF EXISTS`,那是 MariaDB 语法),
 * 所以索引/列的守卫用 information_schema 判存(照 scripts/ops/archive-indexes.sql 的做法)。
 *
 * 用法: pnpm exec tsx scripts/ci/check-migration-idempotency.mjs
 * 退出码: 0 = 通过;1 = 有违规
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_MIGRATIONS_DIR = join(REPO_ROOT, "prisma", "schema-business", "migrations");
const DEFAULT_ALLOWLIST = join(REPO_ROOT, "scripts", "ci", "migration-idempotency-allowlist.txt");

export type Violation = {
  readonly file: string;
  readonly line: number;
  readonly rule: string;
  readonly message: string;
  readonly hint: string;
};

export type LintResult = {
  readonly violations: readonly Violation[];
  /** 参与检查的迁移目录名 */
  readonly checked: readonly string[];
  /** 因历史放行而跳过的迁移目录名 */
  readonly skipped: readonly string[];
  /** 放行名单里已不存在的条目 */
  readonly staleAllowlistEntries: readonly string[];
};

/** 单条语句的规则表:命中即违规 */
type Rule = {
  readonly id: string;
  readonly message: string;
  readonly hint: string;
  /** 无守卫的命中条件 */
  readonly matches: (s: string) => boolean;
  /** 已有守卫的命中条件(命中则放行);缺省=守卫必须写在语句里 */
  readonly guarded?: (s: string) => boolean;
};

const hasInformationSchema = (s: string) => /\bINFORMATION_SCHEMA\b/.test(s);

const RULES: readonly Rule[] = [
  {
    id: "R1",
    message: "CREATE TABLE 缺 IF NOT EXISTS",
    hint: "改写成 CREATE TABLE IF NOT EXISTS",
    matches: (s) => /\bCREATE\s+TABLE\b/.test(s) && !/\bCREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/.test(s),
  },
  {
    id: "R2",
    message: "DROP TABLE 缺 IF EXISTS",
    hint: "改写成 DROP TABLE IF EXISTS",
    matches: (s) => /\bDROP\s+TABLE\b/.test(s) && !/\bDROP\s+TABLE\s+IF\s+EXISTS\b/.test(s),
  },
  {
    id: "R3",
    message: "建索引缺幂等守卫",
    hint: "用 information_schema.STATISTICS 判存后再建(照 scripts/ops/archive-indexes.sql 的过程写法)",
    matches: (s) =>
      /\bCREATE\s+(UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?INDEX\b/.test(s) ||
      /\bALTER\s+TABLE\b[\s\S]*\bADD\s+(UNIQUE\s+|FULLTEXT\s+|SPATIAL\s+)?(INDEX|KEY)\b/.test(s),
    guarded: hasInformationSchema,
  },
  {
    id: "R4",
    message: "ALTER TABLE ADD COLUMN 缺幂等守卫",
    hint: "用 information_schema.COLUMNS 判存后再 ADD(MySQL 8.4 无 ADD COLUMN IF NOT EXISTS)",
    matches: (s) =>
      /\bALTER\s+TABLE\b[\s\S]*\bADD\s+(?!INDEX\b|KEY\b|PRIMARY\b|UNIQUE\b|CONSTRAINT\b|FOREIGN\b|CHECK\b)[`A-Za-z_]/.test(
        s,
      ),
    guarded: hasInformationSchema,
  },
  {
    id: "R5",
    message: "删列/删索引缺幂等守卫",
    hint: "用 information_schema 判存后再删",
    matches: (s) =>
      /\bALTER\s+TABLE\b[\s\S]*\bDROP\s+(COLUMN\s+|INDEX\s+|KEY\s+|FOREIGN\s+KEY\s+)/.test(s) ||
      /\bDROP\s+INDEX\b/.test(s),
    guarded: hasInformationSchema,
  },
  {
    id: "R6",
    message: "INSERT 缺幂等写法",
    hint: "改写成 INSERT IGNORE / ON DUPLICATE KEY UPDATE / WHERE NOT EXISTS",
    matches: (s) =>
      /\bINSERT\s+INTO\b/.test(s) &&
      !/\bIGNORE\b/.test(s) &&
      !/\bON\s+DUPLICATE\s+KEY\b/.test(s) &&
      !/\bWHERE\s+NOT\s+EXISTS\b/.test(s) &&
      !/\bON\s+CONFLICT\b/.test(s),
  },
  {
    id: "R7",
    message: "破坏性语句(TRUNCATE / 无 WHERE 的 DELETE)",
    hint: "迁移里禁止清表/全表删",
    matches: (s) => /\bTRUNCATE\b/.test(s) || (/\bDELETE\s+FROM\b/.test(s) && !/\bWHERE\b/.test(s)),
  },
  {
    id: "R8",
    message: "禁止 DROP DATABASE / DROP SCHEMA",
    hint: "迁移只改当前库的业务表",
    matches: (s) => /\bDROP\s+(DATABASE|SCHEMA)\b/.test(s),
  },
];

/** 去掉 SQL 注释,只留可执行文本 */
export function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** 语句切分:按 `;` 收尾,返回 [起始行号, 语句原文] */
export function splitStatements(sql: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const lines = sql.split("\n");
  let buf: string[] = [];
  let startLine = 1;
  lines.forEach((raw, idx) => {
    if (buf.length === 0) startLine = idx + 1;
    buf.push(raw);
    const joined = buf.join("\n").trim();
    if (joined.endsWith(";")) {
      out.push({ line: startLine, text: joined });
      buf = [];
    }
  });
  const rest = buf.join("\n").trim();
  if (rest.length > 0) out.push({ line: startLine, text: rest });
  return out;
}

/** 单个迁移文件的规则检查 */
export function lintSql(sql: string, file: string): Violation[] {
  const violations: Violation[] = [];
  for (const stmt of splitStatements(sql)) {
    // 行内豁免:-- guard: <理由>
    if (/--\s*guard:/i.test(stmt.text)) continue;
    const normalized = stripComments(stmt.text).replace(/\s+/g, " ").trim().toUpperCase();
    if (normalized.length === 0) continue;
    for (const rule of RULES) {
      if (!rule.matches(normalized)) continue;
      if (rule.guarded?.(normalized)) continue;
      violations.push({
        file,
        line: stmt.line,
        rule: rule.id,
        message: rule.message,
        hint: rule.hint,
      });
    }
  }
  return violations;
}

/** 读放行名单(每行一个迁移目录名,# 开头为注释) */
export function readAllowlist(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
  return new Set(entries);
}

/** 扫描迁移目录做整体检查 */
export function lintMigrations(migrationsDir: string, allowlist: ReadonlySet<string>): LintResult {
  const violations: Violation[] = [];
  const checked: string[] = [];
  const skipped: string[] = [];
  const staleAllowlistEntries: string[] = [];

  const dirs = existsSync(migrationsDir)
    ? readdirSync(migrationsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort()
    : [];

  for (const name of dirs) {
    if (allowlist.has(name)) {
      skipped.push(name);
      continue;
    }
    const file = join(migrationsDir, name, "migration.sql");
    if (!existsSync(file)) continue;
    checked.push(name);
    violations.push(...lintSql(readFileSync(file, "utf8"), displayPath(file)));
  }

  for (const name of allowlist) {
    if (!dirs.includes(name)) staleAllowlistEntries.push(name);
  }

  return { violations, checked, skipped, staleAllowlistEntries };
}

/** 相对仓库根的展示路径;目录在仓库外则用绝对路径 */
function displayPath(path: string): string {
  const rel = relative(REPO_ROOT, path);
  return rel.startsWith("..") ? path : rel;
}

function main(argv: readonly string[]): number {
  const migrationsDir = argv[0] ?? DEFAULT_MIGRATIONS_DIR;
  const allowlistPath = argv[1] ?? DEFAULT_ALLOWLIST;
  const allowlist = readAllowlist(allowlistPath);
  const result = lintMigrations(migrationsDir, allowlist);

  console.log(`检查迁移目录: ${displayPath(migrationsDir)}`);
  console.log(`参与检查: ${result.checked.length} 条;历史放行: ${result.skipped.length} 条`);

  if (result.staleAllowlistEntries.length > 0) {
    console.error(
      `✗ 放行名单里有已不存在的迁移目录: ${result.staleAllowlistEntries.join(", ")}`,
    );
    return 1;
  }

  if (result.violations.length === 0) {
    console.log("✓ 迁移幂等检查通过");
    return 0;
  }

  console.error(`✗ 迁移幂等检查失败(${result.violations.length} 处)`);
  for (const v of result.violations) {
    console.error(`  ${v.file}:${v.line}  [${v.rule}] ${v.message}`);
    console.error(`      → ${v.hint}`);
  }
  console.error("  (单条语句可用 `-- guard: <理由>` 注释豁免)");
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
