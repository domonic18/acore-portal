import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 启动钩子依赖图守卫:
 * Next 14 会为 instrumentation 额外编译一份 edge 产物
 * (server/edge-instrumentation.js),其传递依赖图内出现 node-only 包
 * → edge 编译报 "Can't resolve 'stream'" → next dev 与 next build 双双失败。
 *
 * 该失败曾以「E2E 起不了 dev server」的形式出现,根因离报错点很远,
 * 故在此固化为红测试。
 */

const SRC_ROOT = path.resolve(process.cwd(), "src");
const ENTRY = path.join(SRC_ROOT, "instrumentation.ts");

/** 本仓已知 node-only 的第三方包(edge 运行时无对应实现) */
const NODE_ONLY_PACKAGES = new Set([
  "ioredis",
  "mysql2",
  "bcrypt",
  "bcryptjs",
  "nodemailer",
  "node-soap",
]);

/** node-only 内置模块(edge 运行时不可用) */
const NODE_ONLY_BUILTINS = new Set([
  "fs",
  "child_process",
  "cluster",
  "dns",
  "http",
  "https",
  "net",
  "os",
  "path",
  "readline",
  "repl",
  "tls",
  "tty",
  "vm",
  "worker_threads",
  "zlib",
]);

const IMPORT_RE =
  /(?:^|[\s;}])(?:import|export)\s+(?:[\s\S]*?\sfrom\s+)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function extractSpecifiers(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(IMPORT_RE)) {
    const spec = match[1] ?? match[2];
    if (spec) out.push(spec);
  }
  return out;
}

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) {
    base = path.join(SRC_ROOT, spec.slice(2));
  } else if (spec.startsWith(".")) {
    base = path.resolve(path.dirname(fromFile), spec);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, "index.ts"),
    path.join(base, "index.tsx"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

type Graph = { files: string[]; packages: Set<string> };

function walk(entry: string): Graph {
  const seen = new Set<string>();
  const files: string[] = [];
  const packages = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    files.push(path.relative(SRC_ROOT, file));

    const source = readFileSync(file, "utf8");
    for (const spec of extractSpecifiers(source)) {
      const local = resolveLocal(spec, file);
      if (local) {
        queue.push(local);
        continue;
      }
      if (spec.startsWith("node:")) {
        packages.add(spec);
        continue;
      }
      if (spec.startsWith("@/") || spec.startsWith(".")) continue; // 别名未解析 → 忽略
      packages.add(spec);
    }
  }
  return { files, packages };
}

describe("instrumentation 依赖图无 node-only 包", () => {
  const graph = walk(ENTRY);

  it("依赖图可解析(入口存在且能递归出文件)", () => {
    expect(graph.files).toContain("instrumentation.ts");
    expect(graph.files.length).toBeGreaterThan(1);
  });

  it("不含 node-only 第三方包(ioredis/mysql2/... )", () => {
    const offenders = [...graph.packages].filter((p) => NODE_ONLY_PACKAGES.has(p));
    expect(offenders).toEqual([]);
  });

  it("不含 node-only 内置模块与 node: 前缀模块", () => {
    const offenders = [...graph.packages].filter(
      (p) => p.startsWith("node:") || NODE_ONLY_BUILTINS.has(p),
    );
    expect(offenders).toEqual([]);
  });
});
