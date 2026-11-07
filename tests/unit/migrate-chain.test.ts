import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STEPS } from "../../scripts/migrate/rehearse.mjs";

/**
 * 迁移链守卫(2026-11-07 迁移就绪度收口):
 * ① 链里的每一步都必须登记在 STEPS——漏登记 = 切换日少导一段数据且无人发现;
 * ② 迁移脚本里不得再出现硬编码的目标 schema 前缀或 host:port 默认连接串
 *    (前者会让「连 A 库、SQL 写 B 库」,后者曾让 slug-normalize 静默打到测试栈 3308);
 * ③ STEPS 的依赖边不得成环,且引用��� id 必须存在。
 */
const MIGRATE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/migrate");

function scriptFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "lib" ? [] : scriptFiles(p);
    return e.name.endsWith(".mjs") || e.name.endsWith(".sql") ? [p] : [];
  });
}

describe("迁移链登记", () => {
  it("每个迁移脚本都在 STEPS 里登记", () => {
    const registered = new Set(STEPS.map((s) => s.file));
    const missing = scriptFiles(MIGRATE_DIR)
      .map((f) => path.basename(f))
      .filter((name) => !registered.has(name) && name !== "rehearse.mjs" && name !== "reconcile.mjs");
    expect(missing).toEqual([]);
  });

  it("STEPS 的 file 都真实存在", () => {
    for (const s of STEPS) {
      expect(() => readFileSync(path.join(MIGRATE_DIR, s.file), "utf8")).not.toThrow();
    }
  });

  it("依赖边引用存在的 id 且不成环", () => {
    const ids = new Set(STEPS.map((s) => s.id));
    for (const s of STEPS) {
      for (const dep of s.after) expect(ids.has(dep)).toBe(true);
    }
    // 拓扑排序:若成环则无法排完
    const pending = new Map(STEPS.map((s) => [s.id, [...s.after]]));
    let progressed = true;
    while (pending.size > 0 && progressed) {
      progressed = false;
      for (const [id, deps] of pending) {
        if (deps.every((d) => !pending.has(d))) {
          pending.delete(id);
          progressed = true;
        }
      }
    }
    expect(pending.size).toBe(0);
  });

  it("媒体映射先于依赖它的内容/论坛导入", () => {
    const indexOf = (id: string) => STEPS.findIndex((s) => s.id === id);
    expect(indexOf("media-cos")).toBeLessThan(indexOf("content"));
    expect(indexOf("media-cos")).toBeLessThan(indexOf("forum"));
    expect(indexOf("forum")).toBeLessThan(indexOf("route-map-m3"));
    expect(indexOf("shop")).toBeLessThan(indexOf("slug"));
  });
});

describe("迁移脚本脚枪守卫", () => {
  const files = scriptFiles(MIGRATE_DIR);

  it("不含硬编码目标 schema 前缀(目标库由连接串决定)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // 源库前缀 wp_legacy. 合法;目标库前缀一律不得写死
      const hit = src.match(/\bacore_portal\./g);
      if (hit) offenders.push(`${path.basename(f)}: ${hit.length} 处`);
    }
    expect(offenders).toEqual([]);
  });

  it("不含硬编码 host:port 连接串(漏传 env 时必须报错而非猜库)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const hit = src.match(/127\.0\.0\.1:\d{4}/g);
      if (hit) offenders.push(`${path.basename(f)}: ${hit.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });
});
