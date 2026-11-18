import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { reloadSystemConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { AUDIT_ACTION } from "@/constants/audit";
import { MCP_CONFIG_KEYS, MCP_SCOPE } from "@/constants/mcp";
import {
  issueMcpToken,
  readMcpTokenView,
  revokeMcpToken,
  updateMcpLimits,
  verifyMcpToken,
} from "@/server/services/mcp/auth";

/**
 * MCP 长期访问令牌集成(二期 M6;规格 §17.3)
 *
 * 口径:令牌只写不读(库中仅存哈希)、签发即覆盖(同时只有一枚活跃令牌)、
 * 吊销即失效、过期拒绝;后台视图与审计都不回显明文/哈希。
 */

const MCP_KEYS = Object.values(MCP_CONFIG_KEYS);
let prior: { key: string; value: string }[] = [];

beforeAll(async () => {
  prior = await prisma.systemConfig.findMany({
    where: { key: { in: MCP_KEYS } },
    select: { key: true, value: true },
  });
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: MCP_KEYS } } });
  if (prior.length > 0) await prisma.systemConfig.createMany({ data: prior });
  await reloadSystemConfig();
  await prisma.auditLog.deleteMany({
    where: { action: { in: [AUDIT_ACTION.MCP_TOKEN_ISSUED, AUDIT_ACTION.MCP_TOKEN_REVOKED] } },
  });
});

describe("MCP 令牌签发与校验", () => {
  it("签发后库中只有哈希,明文不落库;校验通过", async () => {
    const issued = await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 30 });

    expect(issued.plain.startsWith("lokta_mcp_")).toBe(true);
    expect(issued.tokenPrefix.length).toBeGreaterThan("lokta_mcp_".length);

    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: MCP_KEYS } },
      select: { key: true, value: true },
    });
    const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(flat[MCP_CONFIG_KEYS.tokenHash]).toBe(sha256Hex(issued.plain));
    expect(flat[MCP_CONFIG_KEYS.tokenHash]).not.toContain(issued.plain);
    for (const row of rows) {
      expect(row.value).not.toContain(issued.plain);
    }

    const check = await verifyMcpToken(issued.plain);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.scope).toBe(MCP_SCOPE.WRITE);
      expect(check.tokenId).toBe(sha256Hex(issued.plain).slice(0, 12));
    }
  });

  it("后台视图只回「已配置」与前缀,不含哈希/明文", async () => {
    const issued = await issueMcpToken({ scope: MCP_SCOPE.READ, ttlDays: 30 });
    const view = await readMcpTokenView();

    expect(view.configured).toBe(true);
    expect(view.scope).toBe(MCP_SCOPE.READ);
    expect(view.tokenPrefix).toBe(issued.tokenPrefix);
    expect(JSON.stringify(view)).not.toContain(issued.plain);
    expect(JSON.stringify(view)).not.toContain(sha256Hex(issued.plain));
  });

  it("覆盖签发使旧令牌立即失效(同时只有一枚活跃令牌)", async () => {
    const first = await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 30 });
    const second = await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 30 });

    expect(second.plain).not.toBe(first.plain);

    const oldCheck = await verifyMcpToken(first.plain);
    expect(oldCheck.ok).toBe(false);
    if (!oldCheck.ok) expect(oldCheck.reason).toBe("invalid");

    const newCheck = await verifyMcpToken(second.plain);
    expect(newCheck.ok).toBe(true);
  });

  it("吊销后校验失败", async () => {
    const issued = await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 30 });
    expect((await verifyMcpToken(issued.plain)).ok).toBe(true);

    await revokeMcpToken();

    const check = await verifyMcpToken(issued.plain);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("not_configured");
    expect((await readMcpTokenView()).configured).toBe(false);
  });

  it("过期令牌拒绝", async () => {
    const issued = await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 1 });
    await prisma.systemConfig.update({
      where: { key: MCP_CONFIG_KEYS.tokenExpiresAt },
      data: { value: new Date(Date.now() - 60_000).toISOString() },
    });
    await reloadSystemConfig();

    const check = await verifyMcpToken(issued.plain);
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("expired");
  });

  it("错误令牌一律 invalid(不区分不存在/不匹配)", async () => {
    await issueMcpToken({ scope: MCP_SCOPE.WRITE, ttlDays: 30 });
    const check = await verifyMcpToken("lokta_mcp_definitely_wrong");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe("invalid");
  });

  it("限额调整落库并即时生效", async () => {
    await updateMcpLimits({ qpsLimit: 7, dailyLimit: 33, ipMaxPerMin: 44 });
    const view = await readMcpTokenView();
    expect(view.qpsLimit).toBe(7);
    expect(view.dailyLimit).toBe(33);
    expect(view.ipMaxPerMin).toBe(44);
  });
});
