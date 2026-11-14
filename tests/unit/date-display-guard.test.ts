import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 日期展示守卫(2026-11-14 时区对齐):
 * 站内日期渲染的唯一出口是 src/lib/format.ts(东八区固定口径)。
 * 这里对 src/ 做源码扫描,禁掉三类会绕开出口、从而把展示时区
 * 交给运行时环境变量的写法:
 *
 *  ① toLocaleDateString / toLocaleTimeString / 无参 toLocaleString
 *     —— 裸调用取运行时默认时区,换个容器就偏 8 小时;
 *  ② toISOString().slice(...) 从 UTC ISO 串里截日期
 *     —— 北京 00:00–08:00 的内容会被算成前一天;
 *  ③ getFullYear/getMonth/getDate/getHours/getMinutes/getDay
 *     —— 取的是进程本地时区分量,同样随环境漂移。
 *
 * 已知局限:toLocaleString("zh-CN") 只有在接收者是日期字面量
 * (Date / getTime() / *_at 等)时才判定为违规;接收者是别名变量
 * (如 const d = new Date(); d.toLocaleString("zh-CN"))属启发式盲区。
 * 这类写法目前不存在,规则 ① 与 ③ 已覆盖绝大多数入口。
 */

const SRC_ROOT = path.resolve(process.cwd(), "src");
/** 唯一出口:本模块自身豁免 */
const ALLOWED = new Set([path.join(SRC_ROOT, "lib", "format.ts")]);

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

/** 去掉注释(保留字符串字面量),避免注释里的示例文字误判 */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** 接收者像日期的判定:Date 字面量 / getTime() / *_at 等日期字段名 */
const DATE_RECEIVER = /(\bDate\b|getTime\s*\(|\bdate\b|\w+_at\b|\w+At\b)/;

type Violation = { file: string; line: number; rule: string; text: string };

function scanSource(source: string, label: string): Violation[] {
  const raw = stripComments(source);
  const violations: Violation[] = [];
  raw.split("\n").forEach((line, idx) => {
    const lineNo = idx + 1;
    const report = (rule: string, text: string) => {
      violations.push({ file: label, line: lineNo, rule, text: text.trim() });
    };

    // ① 时区交给运行时的本地化渲染
    if (/\.toLocaleDateString\s*\(/.test(line)) report("toLocaleDateString", line);
    if (/\.toLocaleTimeString\s*\(/.test(line)) report("toLocaleTimeString", line);
    const localeCall = line.match(/\.toLocaleString\s*\(([^)]*)\)/);
    if (localeCall) {
      const args = localeCall[1]!.trim();
      const receiver = line.slice(0, localeCall.index);
      if (args === "") report("toLocaleString() 无参", line);
      else if (DATE_RECEIVER.test(receiver)) report("toLocaleString(日期)", line);
    }
    // ② 从 UTC ISO 串里截日期
    if (/\.toISOString\s*\(\s*\)\s*\.\s*(slice|split|substring|substr)\s*\(/.test(line)) {
      report("toISOString().slice 截日期", line);
    }
    // ③ 取本地时区分量
    if (/\.(getFullYear|getMonth|getDate|getHours|getMinutes|getDay|getSeconds)\s*\(/.test(line)) {
      report("本地时区分量取值", line);
    }
  });
  return violations;
}

function scan(file: string): Violation[] {
  return scanSource(readFileSync(file, "utf8"), path.relative(SRC_ROOT, file));
}

const FILES = walk(SRC_ROOT).filter((f) => !ALLOWED.has(f));
const VIOLATIONS = FILES.flatMap(scan);

describe("日期展示守卫", () => {
  it("扫描到源码文件(守卫本身没跑空)", () => {
    expect(FILES.length).toBeGreaterThan(50);
  });

  it("违规写法确实会被拦下(守卫不是空转)", () => {
    const found = scanSource(
      [
        'const a = new Date().toLocaleDateString();',
        'const b = new Date().toLocaleTimeString();',
        'const c = new Date().toLocaleString();',
        'const d = new Date().toLocaleString("zh-CN");',
        'const e = new Date().toISOString().slice(0, 10);',
        'const f = new Date().getFullYear();',
        'const g = post.createdAt.toLocaleString("zh-CN");',
      ].join("\n"),
      "synthetic.ts",
    );
    expect(found.map((v) => v.rule).sort()).toEqual(
      [
        "toISOString().slice 截日期",
        "toLocaleDateString",
        "toLocaleString() 无参",
        "toLocaleString(日期)",
        "toLocaleString(日期)",
        "toLocaleTimeString",
        "本地时区分量取值",
      ].sort(),
    );
  });

  it("注释与数字格式化不误判", () => {
    const found = scanSource(
      [
        "// 禁止直接 toLocaleString / toLocaleDateString 取日期",
        '/* toLocaleDateString() */',
        'const total = count.toLocaleString("zh-CN");',
      ].join("\n"),
      "synthetic.ts",
    );
    expect(found).toEqual([]);
  });

  it("src/ 内无绕开 lib/format 的日期渲染写法", () => {
    expect(
      VIOLATIONS.map((v) => `${v.file}:${v.line} [${v.rule}] ${v.text}`).join("\n"),
    ).toBe("");
  });
});
