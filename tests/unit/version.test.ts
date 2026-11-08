import { afterEach, describe, expect, it, vi } from "vitest";
import { formatBuildInfo } from "@/constants/version";

/**
 * 构建信息(构建时间 + 提交短号)的纯函数校验。
 * 渲染口径在页脚组件,此处只测归一化与文案拼接:
 *   - 缺省 "unknown" → 归一为空串(本地手工构建,页面整行不渲染)
 *   - 两值皆空 → 空串
 *   - 缺项不拼空段
 */
describe("构建信息文案", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("时间与短号齐全 → 「构建于 <时间> · <短号>」", () => {
    expect(formatBuildInfo("2026-11-08 10:52", "e04370b")).toBe(
      "构建于 2026-11-08 10:52 · e04370b",
    );
  });

  it("只有时间 → 不拼空段", () => {
    expect(formatBuildInfo("2026-11-08 10:52", "")).toBe("构建于 2026-11-08 10:52");
  });

  it("只有短号 → 不带「构建于」前缀", () => {
    expect(formatBuildInfo("", "e04370b")).toBe("e04370b");
  });

  it("两值皆空 → 空串(页面据此整行不渲染)", () => {
    expect(formatBuildInfo("", "")).toBe("");
  });
});

describe("构建信息常量归一化", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("unknown → 空串(本地手工构建无构建信息)", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "unknown");
    vi.stubEnv("NEXT_PUBLIC_APP_SHA", "unknown");
    vi.resetModules();
    const mod = await import("@/constants/version");
    expect(mod.BUILD_TIME).toBe("");
    expect(mod.APP_SHA).toBe("");
    expect(formatBuildInfo(mod.BUILD_TIME, mod.APP_SHA)).toBe("");
  });

  it("未定义 → 空串", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "");
    vi.stubEnv("NEXT_PUBLIC_APP_SHA", "");
    vi.resetModules();
    const mod = await import("@/constants/version");
    expect(mod.BUILD_TIME).toBe("");
    expect(mod.APP_SHA).toBe("");
  });

  it("有值时原样透出", async () => {
    vi.stubEnv("NEXT_PUBLIC_BUILD_TIME", "2026-11-08 10:52");
    vi.stubEnv("NEXT_PUBLIC_APP_SHA", "e04370b");
    vi.resetModules();
    const mod = await import("@/constants/version");
    expect(mod.BUILD_TIME).toBe("2026-11-08 10:52");
    expect(mod.APP_SHA).toBe("e04370b");
    expect(formatBuildInfo(mod.BUILD_TIME, mod.APP_SHA)).toBe(
      "构建于 2026-11-08 10:52 · e04370b",
    );
  });
});
