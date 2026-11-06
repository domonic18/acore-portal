import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { reloadSystemConfig } from "@/lib/config";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { SECURITY_ALERT_KIND, securityAlertKey } from "@/constants/security";
import { queryAuditLog } from "@/server/services/shared/audit";
import { getSecurityDashboardView } from "@/server/services/security/audit-view";
import { evaluateSecurityAlerts } from "@/server/services/security/alerts";
import { pinSystemConfig, restoreSystemConfig } from "../helpers/system-config";

/**
 * 2026-11-06 撞库加固 PR-J——审计读取 + 告警:
 * ① audit_log 此前**只写不读**——撞库既无法界定受害账号,也无法复盘;
 * ② 看板按 IP 聚合失败数与**命中账号数**(撞库与手抖的区别在广度);
 * ③ 越阈 → 落 SECURITY_ALERT 审计 + 给管理员发站内信;
 * ④ 告警去重(Redis NX):持续攻击不得刷爆管理员收件箱;
 * ⑤ 非管理员不收站内信。
 *
 * 阈值显式钉住(不依赖库里现值),用完原样还原。
 */
const RUN = Date.now().toString(36);
const PINNED: Record<string, string> = {
  // 失败数越阈线钉到 10:本用例的撞库源失败 30 次必越阈,
  // 而库里其他用例的残留行(多为个位数)不越阈 → 告警面只落在本用例的对象上,
  // 不会给管理员发一堆与本用例无关的站内信
  "security.loginIpSoftFails": "10",
  "security.loginWindowSec": "900",
};
const PINNED_KEYS = Object.keys(PINNED);

/** IP 段掺 RUN:审计行是持久数据,固定 IP 会被自身历史行污染聚合断言 */
const ipOf = (n: number) => `203.0.${parseInt(RUN, 36) % 254}.${n}`;
const ATTACK_IP = ipOf(77);
const QUIET_IP = ipOf(78);
const VICTIM = `victim-${RUN}`;
const ADMIN_USER = `secadmin_${RUN}`;
const ADMIN_EMAIL = `secadmin_${RUN}@example.test`;
const NORMAL_USER = `secuser_${RUN}`;
const NORMAL_EMAIL = `secuser_${RUN}@example.test`;

const createdAuditIds: bigint[] = [];
const redisKeys: string[] = [];
let adminId: bigint;
let normalId: bigint;
let priorPinned: { key: string; value: string }[] = [];

async function audit(
  action: string,
  payload: Record<string, string | number | boolean | null>,
  ip: string | null,
  actorUserId: bigint | null = null,
) {
  const row = await prisma.auditLog.create({
    data: {
      category: AUDIT_CATEGORY.SECURITY,
      action,
      actorUserId,
      payloadJson: payload,
      ip,
    },
  });
  createdAuditIds.push(row.id);
  return row;
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  // 先清同 IP 的历史行:IP 由 RUN 派生,重复跑可能撞上上一轮的行,
  // 而聚合断言(失败数/命中账号数)是全窗口口径,历史行会把数字撑大
  await prisma.auditLog.deleteMany({ where: { ip: { in: [ATTACK_IP, QUIET_IP] } } });
  priorPinned = await pinSystemConfig(PINNED);
  await reloadSystemConfig();

  const admin = await prisma.user.create({
    data: {
      username: ADMIN_USER,
      email: ADMIN_EMAIL,
      passwordHash: "x",
      passwordAlgo: "bcrypt_wp",
      role: "admin",
    },
  });
  adminId = admin.id;
  const normal = await prisma.user.create({
    data: {
      username: NORMAL_USER,
      email: NORMAL_EMAIL,
      passwordHash: "x",
      passwordAlgo: "bcrypt_wp",
      role: "user",
    },
  });
  normalId = normal.id;

  // 撞库源:30 次失败打在 4 个不同账号上(同一账号反复试 + 横扫一片的混合形态)
  // 失败数刻意压过库里其他残留 IP(看板只列 TOP20 嫌疑来源,失败数不够就排不进去)
  for (let i = 0; i < 30; i++) {
    await audit(
      AUDIT_ACTION.LOGIN_FAILED_UNKNOWN,
      { username: `spray${i % 4}_${RUN}` },
      ATTACK_IP,
    );
  }
  // 安静源:1 次失败(手抖),不该越阈
  await audit(AUDIT_ACTION.LOGIN_FAILED, { reason: "bad_password" }, QUIET_IP, normalId);
  // 受害者账号被锁
  await audit(AUDIT_ACTION.LOGIN_LOCKED, { username: VICTIM, fails: 5, ip: ATTACK_IP }, ATTACK_IP);
  // 一次成功登录
  await audit(AUDIT_ACTION.LOGIN_SUCCESS, { username: ADMIN_USER }, QUIET_IP, adminId);

  redisKeys.push(
    securityAlertKey(SECURITY_ALERT_KIND.IP_FAILURE_BURST, ATTACK_IP),
    securityAlertKey(SECURITY_ALERT_KIND.ACCOUNT_LOCKED, VICTIM),
  );
});

afterAll(async () => {
  await restoreSystemConfig(PINNED_KEYS, priorPinned);
  await reloadSystemConfig();
  if (createdAuditIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
  }
  // 告警自己写的审计行与站内信一并回收
  // 站内信发给**全部**管理员(不止本用例建的 admin)→ 按类型+时间窗整体回收,
  // 否则库里其他管理员会攒下一堆与本用例无关的告警信
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.SECURITY_ALERT, createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  await prisma.notification.deleteMany({
    where: { type: "security", createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  await prisma.user.deleteMany({ where: { id: { in: [adminId, normalId] } } });
  if (redisKeys.length > 0) await redis.del(...redisKeys);
  await prisma.$disconnect();
  await redis.quit();
});

describe("PR-J 审计读取", () => {
  it("按 category/action/ip 过滤并游标翻页(末页 nextCursor 为 null)", async () => {
    const first = await queryAuditLog({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_FAILED_UNKNOWN,
      limit: 2,
    });
    expect(first.items.length).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    // id 倒序 = 时间倒序
    expect(BigInt(first.items[0]!.id)).toBeGreaterThan(BigInt(first.items[1]!.id));

    const second = await queryAuditLog({
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_FAILED_UNKNOWN,
      limit: 2,
      cursor: first.nextCursor,
    });
    expect(second.items.length).toBe(2);
    expect(
      second.items.every((i) => BigInt(i.id) < BigInt(first.items[first.items.length - 1]!.id)),
    ).toBe(true);

    const byIp = await queryAuditLog({ ip: ATTACK_IP, limit: 50 });
    expect(byIp.items.length).toBeGreaterThan(0);
    expect(byIp.items.every((i) => i.ip === ATTACK_IP)).toBe(true);
  });

  it("看板:按 IP 聚合失败数与命中账号数(喷洒广度)", async () => {
    const view = await getSecurityDashboardView();
    const attacker = view.offenders.find((o) => o.ip === ATTACK_IP);
    expect(attacker).toBeDefined();
    expect(attacker!.fails).toBe(30);
    expect(attacker!.targets).toBe(4);
    // 1 次失败的手抖源不入越阈统计
    expect(view.totals.offenderIps).toBeGreaterThanOrEqual(1);
  });

  it("看板:被锁账号入列(被撞的受害方)", async () => {
    const view = await getSecurityDashboardView();
    const locked = view.lockedAccounts.find((a) => a.username === VICTIM);
    expect(locked).toBeDefined();
    expect(locked!.fails).toBe(5);
    expect(locked!.ip).toBe(ATTACK_IP);
  });
});

describe("PR-J 安全告警", () => {
  it("越阈:落 SECURITY_ALERT 审计 + 给管理员发站内信", async () => {
    const result = await evaluateSecurityAlerts();
    const burst = result.raised.find(
      (a) => a.kind === SECURITY_ALERT_KIND.IP_FAILURE_BURST && a.subject === ATTACK_IP,
    );
    expect(burst).toBeDefined();
    expect(burst!.count).toBe(30);
    const lockedAlert = result.raised.find(
      (a) => a.kind === SECURITY_ALERT_KIND.ACCOUNT_LOCKED && a.subject === VICTIM,
    );
    expect(lockedAlert).toBeDefined();

    const alertRows = await prisma.auditLog.findMany({
      where: { action: AUDIT_ACTION.SECURITY_ALERT },
      select: { ip: true, payloadJson: true },
    });
    expect(alertRows.some((r) => r.ip === ATTACK_IP)).toBe(true);

    const adminNotifs = await prisma.notification.findMany({
      where: { userId: adminId, type: "security" },
    });
    expect(adminNotifs.length).toBeGreaterThanOrEqual(1);
    // 非管理员不收安全告警
    const normalNotifs = await prisma.notification.findMany({
      where: { userId: normalId, type: "security" },
    });
    expect(normalNotifs.length).toBe(0);
  });

  it("去重:同一对象在窗口内只发一次(Redis NX)", async () => {
    const again = await evaluateSecurityAlerts();
    expect(
      again.raised.some(
        (a) => a.kind === SECURITY_ALERT_KIND.IP_FAILURE_BURST && a.subject === ATTACK_IP,
      ),
    ).toBe(false);
    expect(
      again.raised.some(
        (a) => a.kind === SECURITY_ALERT_KIND.ACCOUNT_LOCKED && a.subject === VICTIM,
      ),
    ).toBe(false);
  });
});
