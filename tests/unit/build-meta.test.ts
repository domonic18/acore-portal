import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/**
 * 构建元信息单一来源(页脚版本行的时区口径):
 * BUILD_TIME 由 scripts/ci/build-meta.sh 一处产出,CI(.github/workflows/release-image.yml)
 * 与本地兜底(scripts/deploy.sh --build-local)共用,固定东八区。
 *
 * 事故背景:2026-11-14 实测 CI 侧用 `date -u` 写 UTC,页脚显示的构建时间比
 * 北京时间差 8 小时(而本地兜底构建走东八区),同一字段两套时区两套格式,
 * 页脚「构建于」行失去人工核对线上版本的意义。
 */
const ROOT = path.resolve(import.meta.dirname, "../..");
const SCRIPT = path.join(ROOT, "scripts/ci/build-meta.sh");

function run(args: string[]): string {
  return execFileSync("bash", [SCRIPT, ...args], { encoding: "utf8" }).trim();
}

/** 当前时刻的北京时间(YYYY-MM-DD HH:mm) */
function beijingNow(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

describe("构建元信息单一来源(东八区)", () => {
  it("build_time 固定东八区,与当前北京时间一致(容差 1 分钟)", () => {
    const buildTime = run(["--field", "build_time"]);
    expect(buildTime).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    // 两侧都按 UTC 解析墙钟串,差值即两次取样之间的真实间隔(跨分钟边界不误伤)
    const diffMin = Math.abs(
      Date.parse(`${buildTime.replace(" ", "T")}:00Z`) -
        Date.parse(`${beijingNow().replace(" ", "T")}:00Z`),
    ) / 60_000;
    expect(diffMin).toBeLessThanOrEqual(1);
  });

  it("输出三行 KEY=value,字段齐全且取值合法", () => {
    const lines = run([]).split("\n");
    expect(lines).toHaveLength(3);
    const kv = Object.fromEntries(lines.map((l) => l.split("=")));
    expect(Object.keys(kv).sort()).toEqual(["branch", "build_time", "sha_short"]);
    expect(kv.sha_short).toMatch(/^[0-9a-f]{7}$/);
    expect(kv.build_time).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
    expect(kv.branch).not.toContain("/"); // 分支名含斜杠时须已换连字符(可直接作 tag 片段)
  });

  it("脚本可执行(CI 与 deploy.sh 直接调用)", () => {
    expect(statSync(SCRIPT).mode & 0o111).toBeGreaterThan(0);
  });

  it("CI 与本地兜底构建都走同一脚本,各自不再单独取构建时间", () => {
    const ci = readFileSync(
      path.join(ROOT, ".github/workflows/release-image.yml"),
      "utf8",
    );
    const deploy = readFileSync(path.join(ROOT, "scripts/deploy.sh"), "utf8");
    expect(ci).toContain("build-meta.sh");
    expect(deploy).toContain("build-meta.sh");
    // CI 侧不再自行拼 build_time(旧的 `date -u` 曾让页脚显示 UTC,差 8 小时)
    expect(ci).not.toMatch(/build_time=\$\(/);
    // 本地兜底:构建时间只在 build_image_local 里取,且只经 build-meta.sh
    const buildFn = deploy.slice(deploy.indexOf("build_image_local() {"));
    expect(buildFn).toContain("build-meta.sh");
    expect(buildFn).not.toMatch(/\bdate\b/);
  });
});
