import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/db/business";
import { reloadSystemConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/auth/game-hash";
import { AUDIT_ACTION } from "@/constants/audit";
import { MCP_CONFIG_KEYS, MCP_SCOPE, MCP_TOKEN_PLAIN_PREFIX, maskMcpToken } from "@/constants/mcp";
import {
  ensureMcpToken,
  readMcpTokenView,
  revealMcpToken,
  rotateMcpToken,
  updateMcpLimits,
  updateMcpTokenScope,
  verifyMcpToken,
} from "@/server/services/mcp/auth";

/**
 * MCP 访问令牌集成(二期 M6;规格 §17.3;2026-11-19 改 MiniMax 式)
 *
 * 口径:默认已有一枚(进页自动补发)、掩码显示、随时复制、随时轮换、**无有效期**;
 * 令牌状态键不进设置页(整组提交会覆盖),故由本域直写 system_config + 热生效。
 */

const MCP_KEYS = Object.values(MCP_CONFIG_KEYS);
let prior: { key: string; value: string }[] = [];

beforeAll(async () => {
  prior = await prisma.systemConfig.findMany({
    where: { key: { in: MCP_KEYS } },
    select: { key: true, value: true },
  });
  // 清空后重载配置快照:ensureMcpToken 读的是 config 缓存,
  // 不清库则库里已有令牌(开发库常驻一枚)⇒ created 恒为 false,用例失真
  await prisma.systemConfig.deleteMany({ where: { key: { in: MCP_KEYS } } });
  await reloadSystemConfig();
});

afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: MCP_KEYS } } });
  if (prior.length > 0) await prisma.systemConfig.createMany({ data: prior });
  await reloadSystemConfig();
  await prisma.auditLog.deleteMany({
    where: {
      action: {
        in: [
          AUDIT_ACTION.MCP_TOKEN_ISSUED,
          AUDIT_ACTION.MCP_TOKEN_COPIED,
          AUDIT_ACTION.MCP_TOKEN_SCOPE_CHANGED,
          AUDIT_ACTION.MCP_TOKEN_LIMITS_CHANGED,
          AUDIT_ACTION.MCP_TOKEN_BOUND,
        ],
      },
    },
  });
});

describe("MCP 令牌默认补发与校验", () => {
  it("库里无令牌时自动补发一枚,前缀固定,校验通过", async () => {
    const issued = await ensureMcpToken();
    expect(issued.created).toBe(true);
    expect(issued.plain.startsWith(MCP_TOKEN_PLAIN_PREFIX)).toBe(true);

    const rows = await prisma.systemConfig.findMany({
      where: { key: { in: MCP_KEYS } },
      select: { key: true, value: true },
    });
    const flat = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(flat[MCP_CONFIG_KEYS.token]).toBe(issued.plain);

    const check = await verifyMcpToken(issued.plain);
    expect(check.ok).toBe(true);
    if (check.ok) {
      expect(check.scope).toBe(MCP_SCOPE.WRITE);
      expect(check.tokenId).toBe(sha256Hex(issued.plain).slice(0, 12));
    }
  });

  it("已有令牌时补发不覆盖(重复进页拿到同一枚)", async () => {
    const first = await ensureMcpToken();
    const second = await ensureMcpToken();
    expect(second.created).toBe(false);
    expect(second.plain).toBe(first.plain);
  });

  it("令牌存在但绑定为空 ⇒ 带 actor 的补发回填绑定(免轮换自愈)", async () => {
    // 早期自动补发(页面路径)没传 actor ⇒ 令牌在而 tokenAdminUserId 为空,
    // 论坛写工具(实名 actor)全被拒;带 actor 进页应回填且不换令牌
    const before = await ensureMcpToken();
    expect(before.created).toBe(false);
    expect((await readMcpTokenView()).adminUserId).toBeNull();

    const after = await ensureMcpToken(4242n);
    expect(after.created).toBe(false);
    expect(after.plain).toBe(before.plain);

    const check = await verifyMcpToken(before.plain);
    if (!check.ok) throw new Error("令牌校验失败");
    expect(check.adminUserId).toBe(4242n);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTION.MCP_TOKEN_BOUND },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
  });

  it("绑定已存在 ⇒ 补发不覆盖既有绑定(只在空时回填)", async () => {
    await ensureMcpToken(9999n);
    expect((await readMcpTokenView()).adminUserId).toBe("4242");
  });

  it("后台视图只回掩码串,不含明文", async () => {
    const issued = await ensureMcpToken();
    const view = await readMcpTokenView();

    expect(view.configured).toBe(true);
    expect(view.scope).toBe(MCP_SCOPE.WRITE);
    expect(view.maskedToken).toBe(maskMcpToken(issued.plain));
    expect(view.maskedToken).not.toContain(issued.plain);
    expect(JSON.stringify(view)).not.toContain(issued.plain);
  });

  it("复制动作回明文(供后台剪贴板),并留审计", async () => {
    const issued = await ensureMcpToken();
    const plain = await revealMcpToken();
    expect(plain).toBe(issued.plain);

    const audit = await prisma.auditLog.findFirst({
      where: { action: AUDIT_ACTION.MCP_TOKEN_COPIED },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
    // 审计只落前缀,不落明文
    expect(audit?.payloadJson).not.toContain(issued.plain);
  });

  it("轮换覆盖旧令牌,旧令牌立即失效", async () => {
    const first = await ensureMcpToken();
    await rotateMcpToken();
    const second = await ensureMcpToken();

    expect(second.plain).not.toBe(first.plain);

    const oldCheck = await verifyMcpToken(first.plain);
    expect(oldCheck.ok).toBe(false);
    if (!oldCheck.ok) expect(oldCheck.reason).toBe("invalid");

    const newCheck = await verifyMcpToken(second.plain);
    expect(newCheck.ok).toBe(true);
  });

  it("作用域切换即时生效,无需轮换", async () => {
    const issued = await ensureMcpToken();
    await updateMcpTokenScope(MCP_SCOPE.READ);

    const check = await verifyMcpToken(issued.plain);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.scope).toBe(MCP_SCOPE.READ);
    expect((await readMcpTokenView()).scope).toBe(MCP_SCOPE.READ);
  });

  it("错误令牌一律 invalid(不区分不存在/不匹配)", async () => {
    await ensureMcpToken();
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
