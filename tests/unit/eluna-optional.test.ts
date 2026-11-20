import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();
vi.mock("@/lib/config", () => ({ getConfig: () => getConfig() }));

import { getElunaDb } from "@/lib/db/eluna";
import { maskConnectionUrl } from "@/lib/format";
import { resolveSubmittedValue } from "@/server/services/settings/values";
import { sensitiveMode } from "@/server/services/settings/schemas";

/**
 * eluna 可选依赖(2026-11-20):
 * ① 未配置时 client 返回 null(不得拿 undefined 建 client 在构造处炸);
 * ② 配置了照常建 client;
 * ③ 后台擦空输入框即「清除配置」(masked-clearable 口径),其余三库擦空=保持现值。
 */

const CONFIGURED = "mysql://reader:secret@127.0.0.1:3306/acore_eluna";

describe("getElunaDb(可选依赖)", () => {
  beforeEach(() => {
    getConfig.mockReset();
  });

  it("未配置(eluna 缺省)→ 返回 null,不给 undefined 连接串建 client", async () => {
    getConfig.mockResolvedValue({ gamedb: { auth: "a", characters: "c", world: "w" } });
    await expect(getElunaDb()).resolves.toBeNull();
  });

  it("未配置(留空串)→ 同样按未配置处理", async () => {
    getConfig.mockResolvedValue({ gamedb: { auth: "a", characters: "c", world: "w", eluna: "" } });
    await expect(getElunaDb()).resolves.toBeNull();
  });

  it("已配置 → 照常建 client(不返回 null)", async () => {
    getConfig.mockResolvedValue({
      gamedb: { auth: "a", characters: "c", world: "w", eluna: CONFIGURED },
    });
    const db = await getElunaDb();
    expect(db).not.toBeNull();
    await db?.$disconnect().catch(() => undefined);
  });
});

describe("设置保存口径(masked-clearable)", () => {
  it("eluna 登记为可清除;其余三库仍是「擦空=保持」", () => {
    expect(sensitiveMode("gamedb", "eluna")).toBe("masked-clearable");
    expect(sensitiveMode("gamedb", "auth")).toBe("masked");
    expect(sensitiveMode("gamedb", "characters")).toBe("masked");
    expect(sensitiveMode("gamedb", "world")).toBe("masked");
  });

  it("eluna 提交空串 → 清除(落空串,配置层判为未配置)", () => {
    expect(resolveSubmittedValue(CONFIGURED, "", "masked-clearable")).toBe("");
  });

  it("eluna 提交脱敏形态 → 视为未改,保持现值", () => {
    expect(resolveSubmittedValue(CONFIGURED, maskConnectionUrl(CONFIGURED), "masked-clearable")).toBe(
      CONFIGURED,
    );
  });

  it("eluna 提交新连接串 → 原样落库(口令位非 *** 时不介入)", () => {
    const next = "mysql://reader:newpass@10.0.0.9:3306/acore_eluna";
    expect(resolveSubmittedValue(CONFIGURED, next, "masked-clearable")).toBe(next);
  });

  it("eluna 只改 host/库名、口令位仍是 *** → 用现值口令回填", () => {
    const submitted = "mysql://reader:***@10.0.0.9:3306/acore_eluna";
    const merged = resolveSubmittedValue(CONFIGURED, submitted, "masked-clearable");
    expect(merged).toContain("10.0.0.9:3306/acore_eluna");
    expect(merged).not.toContain("***");
    expect(merged).toContain("secret");
  });

  it("其余三库擦空仍是保持现值(可选口径不外溢)", () => {
    expect(resolveSubmittedValue(CONFIGURED, "", "masked")).toBe(CONFIGURED);
  });
});
