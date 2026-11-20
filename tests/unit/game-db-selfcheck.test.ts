import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfig = vi.fn();

vi.mock("@/lib/config", () => ({ getConfig: () => getConfig() }));
// 其余三库与业务库不参与本用例:桩掉,只验 eluna 的「未配置 vs 连不上」两种语义
vi.mock("@/lib/db/auth", () => ({ authDb: { findByUsername: async () => null } }));
vi.mock("@/lib/db/characters", () => ({
  getCharactersDb: async () => ({ $queryRaw: async () => 1 }),
}));
vi.mock("@/lib/db/world", () => ({ getWorldDb: async () => ({ $queryRaw: async () => 1 }) }));
vi.mock("@/lib/db/business", () => ({ prisma: { $queryRaw: async () => 1 } }));

import { checkGameDatabases } from "@/lib/db";

/**
 * 游戏库自检的两种语义必须分开(2026-11-20):
 * - eluna 未配置(可选依赖)⇒ skipped,ok=true,**不阻断启动**;
 * - eluna 配了却连不上 ⇒ ok=false,照旧 fail-fast(配错 ≠ 未配置)。
 * 把「没配」当成「连不上」,可选依赖缺失会拖垮整个门户。
 */

const GAMEDB_BASE = { auth: "mysql://u:p@h:3306/a", characters: "mysql://u:p@h:3306/c", world: "mysql://u:p@h:3306/w" };

describe("checkGameDatabases(eluna 可选依赖)", () => {
  beforeEach(() => {
    getConfig.mockReset();
  });

  it("eluna 未配置 → skipped 且 ok=true(不阻断启动)", async () => {
    getConfig.mockResolvedValue({ gamedb: { ...GAMEDB_BASE } });
    const checks = await checkGameDatabases();
    const eluna = checks.find((c) => c.name === "eluna");
    expect(eluna).toEqual({ name: "eluna", ok: true, skipped: true });
    expect(checks.filter((c) => !c.ok)).toHaveLength(0);
  });

  it("eluna 配了却连不上 → ok=false(启动 fail-fast,不许当没配)", async () => {
    // 127.0.0.1:1 必然拒连:探针抛错 ⇒ 判失败
    getConfig.mockResolvedValue({
      gamedb: { ...GAMEDB_BASE, eluna: "mysql://u:p@127.0.0.1:1/acore_eluna" },
    });
    const checks = await checkGameDatabases();
    const eluna = checks.find((c) => c.name === "eluna");
    expect(eluna?.ok).toBe(false);
    expect(eluna?.skipped).toBeUndefined();
    expect(eluna?.error).toBeTruthy();
  });

  it("其余库正常时不会被误标为 skipped", async () => {
    getConfig.mockResolvedValue({ gamedb: { ...GAMEDB_BASE } });
    const checks = await checkGameDatabases();
    expect(checks.filter((c) => c.skipped).map((c) => c.name)).toEqual(["eluna"]);
  });
});
