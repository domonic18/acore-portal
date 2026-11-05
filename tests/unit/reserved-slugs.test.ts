import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { RESERVED_SLUGS } from "@/constants/content";

/**
 * issue #83:静态页保留字清单与 src/app 顶级路由段一致。
 * 清单缺项 → 内容页可建同名页抢占代码路由(404/白屏);新增顶级路由未登记 → 漏拦。
 */
const APP_DIR = path.resolve(import.meta.dirname, "../../src/app");

/** 顶级 URL 段:路由组(括号目录)下的子目录即根级路由;[动态段] 不占静态名 */
function topLevelSegments(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith("(")) {
      out.push(...topLevelSegments(path.join(dir, entry.name)));
      continue;
    }
    if (entry.name.startsWith("[")) continue;
    out.push(entry.name);
  }
  return out;
}

describe("保留 slug 清单(#83)", () => {
  const segments = topLevelSegments(APP_DIR);

  it("每个顶级路由段都在保留清单里", () => {
    const missing = segments.filter((s) => !RESERVED_SLUGS.includes(s));
    expect(missing).toEqual([]);
  });

  it("清单无重复项", () => {
    expect(new Set(RESERVED_SLUGS).size).toBe(RESERVED_SLUGS.length);
  });

  it("核心内容页不占保留名(它们本身就是内容页)", () => {
    const core = ["about", "tutorial", "agreement", "convention", "sitemap", "devlog"];
    expect(core.filter((s) => RESERVED_SLUGS.includes(s))).toEqual([]);
  });
});
