import { describe, expect, it, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * 发布前的「挂载源预检」判定(挂载源可用 ⇒ 换容器起得来)。
 *
 * 事故背景:
 *   ① 2026-11-15 生产事故——compose 不校验 bind 挂载源,源是**悬空符号链接**
 *      ⇒ 容器创建阶段 mkdir: file exists ⇒ 新容器起不来、连回滚也起不来,整站中断。
 *   ② 同日修完①后首轮发布又栽在预检的**误判**:判定写成「源不是目录 ⇒ 中止」,
 *      而单文件 bind 挂载(Caddyfile / nginx 模板)是合法用法 ⇒ 发布在换容器前被
 *      自己的预检拦下(生产无损失,但发布链断)。
 *
 * 故判据收敛成三态:悬空链接(致命) / 源不存在(放行+提示) / 源与容器内目标类型错配(致命),
 * 其余一律放行;类型未知(容器未运行)时不比对,不得误伤。
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const DEPLOY = path.join(ROOT, "scripts/deploy.sh");

/** 从 deploy.sh 里按标记抽取纯判定函数(不执行脚本主体) */
function extractFunction(): string {
  const src = readFileSync(DEPLOY, "utf8");
  const m = src.match(/# @extract mount_source_verdict[\s\S]*?# @end/);
  if (!m) throw new Error("deploy.sh 缺少 mount_source_verdict 抽取标记");
  return m[0];
}

function fixture(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(path.join(tmpdir(), "mount-check-"));
  mkdirSync(path.join(dir, "a-dir"));
  writeFileSync(path.join(dir, "a-file"), "x");
  symlinkSync(path.join(dir, "gone-target"), path.join(dir, "dangling-link"));
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

/** 跑一次判定:返回 ok / missing / dangling / mismatch */
function verdict(src: string, targetType: string): string {
  const fn = extractFunction();
  return execFileSync(
    "bash",
    ["-c", `${fn}\nmount_source_verdict "$1" "$2"`, "bash", src, targetType],
    { encoding: "utf8" },
  ).trim();
}

describe("发布挂载源预检的判定(单文件挂载合法,单测守住误判)", () => {
  const { dir, cleanup } = fixture();
  afterAll(cleanup);

  it("目录型源 + 目录型目标 ⇒ 放行", () => {
    expect(verdict(path.join(dir, "a-dir"), "dir")).toBe("ok");
  });

  it("单文件源 + 文件型目标 ⇒ 放行(2026-11-15 误判点:Caddyfile / nginx 模板)", () => {
    expect(verdict(path.join(dir, "a-file"), "file")).toBe("ok");
  });

  it("单文件源 + 目录型目标 ⇒ 判错配(源是文件而容器内是目录 ⇒ 容器起不来)", () => {
    expect(verdict(path.join(dir, "a-file"), "dir")).toBe("mismatch");
  });

  it("目录型源 + 文件型目标 ⇒ 判错配", () => {
    expect(verdict(path.join(dir, "a-dir"), "file")).toBe("mismatch");
  });

  it("容器内目标类型未知 ⇒ 不比对直接放行(不得误伤发布)", () => {
    expect(verdict(path.join(dir, "a-file"), "")).toBe("ok");
    expect(verdict(path.join(dir, "a-dir"), "")).toBe("ok");
  });

  it("悬空符号链接 ⇒ 判致命(2026-11-15 生产事故根因)", () => {
    expect(verdict(path.join(dir, "dangling-link"), "dir")).toBe("dangling");
    expect(verdict(path.join(dir, "dangling-link"), "")).toBe("dangling");
  });

  it("源不存在 ⇒ 放行但提示(compose 会自动创建)", () => {
    expect(verdict(path.join(dir, "not-exist"), "dir")).toBe("missing");
  });
});
