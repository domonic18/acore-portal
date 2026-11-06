import fs from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import Redis from "ioredis";
import { PrismaClient } from "../../src/generated/business";
import { SECURITY_ALERT_KIND, securityAlertKey } from "../../src/constants/security";

/**
 * 后台安全看板 E2E(2026-11-06 撞库加固 PR-J):
 * ① 权限口径:游客与 user 访问 /admin/security → 登录页(edge 角色校验拦截);
 * ② admin 进看板 → 渲染近期安全审计行、按 IP 的失败聚合(失败数 + 命中账号数)、被锁账号列表;
 * ③ 流水可翻页(游标链在 URL 里)。
 *
 * 审计行由本 spec 直接落库(PR-J 之前 audit_log 只写不读,没有稳定的读取面可断言):
 * IP 段掺 RUN——审计行是持久数据,固定 IP 会被自身历史行污染聚合断言。
 * 看板加载即评估告警 → 其自写的审计行、站内信与 Redis 去重键一并回收。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const redisUrl =
  fs.readFileSync(".env", "utf8").match(/^REDIS_URL=(.+)$/m)?.[1]?.trim() ??
  "redis://localhost:6381/0";
const redis = new Redis(redisUrl);

const ATTACK_IP = `203.0.${parseInt(RUN, 36) % 254}.71`;
/** 失败总次数(撞库:同一 IP 反复打) */
const FAILS = 25;
/** 命中的不同账号数(喷洒广度)——刻意小于失败数,好让两列在断言里可区分 */
const TARGETS = 10;
const VICTIM = `victim_e2e_${RUN}`;

const createdAuditIds: bigint[] = [];

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  // dev 模式下路由按需编译,首个请求可达 10s+ → 断言超时放宽(生产构建无此开销)
  await expect(page).toHaveURL(/\/account\/overview$/, { timeout: 60_000 });
}

test.beforeAll(async () => {
  // 撞库源:25 次失败打在 10 个不同账号上(同一账号反复试 + 横扫一片的混合形态)
  for (let i = 0; i < FAILS; i++) {
    const row = await prisma.auditLog.create({
      data: {
        category: "security",
        action: "login_failed_unknown",
        actorUserId: null,
        payloadJson: { username: `spray_e2e_${RUN}_${i % TARGETS}` },
        ip: ATTACK_IP,
      },
      select: { id: true },
    });
    createdAuditIds.push(row.id);
  }
  // 被锁账号
  const locked = await prisma.auditLog.create({
    data: {
      category: "security",
      action: "login_locked",
      payloadJson: { username: VICTIM, fails: 5, ip: ATTACK_IP },
      ip: ATTACK_IP,
    },
    select: { id: true },
  });
  createdAuditIds.push(locked.id);
});

test.afterAll(async () => {
  if (createdAuditIds.length > 0) {
    await prisma.auditLog.deleteMany({ where: { id: { in: createdAuditIds } } });
  }
  // 看板加载即评估告警 → 其自写的审计行与站内信一并回收
  await prisma.auditLog.deleteMany({
    where: { action: "security_alert", createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  await prisma.notification.deleteMany({
    where: { type: "security", createdAt: { gte: new Date(Date.now() - 3600_000) } },
  });
  await redis.del(
    securityAlertKey(SECURITY_ALERT_KIND.ACCOUNT_LOCKED, VICTIM),
    securityAlertKey(SECURITY_ALERT_KIND.IP_FAILURE_BURST, ATTACK_IP),
  );
  redis.disconnect();
  await prisma.$disconnect();
});

test("游客与 user 访问 /admin/security → 被拦截回登录页", async ({ page }) => {
  await page.goto("/admin/security");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsecurity$/);
  await expect(page.getByRole("heading", { name: "安全看板" })).toHaveCount(0);

  await login(page, "legacyuser", "oldpass123");
  await page.goto("/admin/security");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fsecurity$/);
  await expect(page.getByRole("heading", { name: "安全看板" })).toHaveCount(0);
});

test.describe.serial("admin 安全看板", () => {
  test("NAV 入口 + 审计行 + 按 IP 聚合 + 被锁账号", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");

    // 布局导航在 <header>(banner)内,/admin 主区自带 <nav> 卡片网格,须双重限定
    await expect(
      page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "安全看板" }),
    ).toHaveAttribute("href", "/admin/security");

    await page.goto("/admin/security");
    await expect(page.getByRole("heading", { name: "安全看板" })).toBeVisible();

    // 嫌疑来源 IP 聚合:失败数(25)与命中账号数(10)是两列,不可混淆
    const offenderRow = page.getByRole("row").filter({ hasText: ATTACK_IP }).first();
    await expect(offenderRow).toBeVisible();
    await expect(offenderRow).toContainText(String(FAILS));
    await expect(offenderRow).toContainText(String(TARGETS));

    // 被锁账号(受害方)在列
    await expect(page.getByText(VICTIM).first()).toBeVisible();

    // 近期审计流水:动作标签可读
    await expect(page.getByText("登录失败(账号不存在)").first()).toBeVisible();
  });

  test("流水翻页:游标链在 URL 里,「更早」可达", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/security");

    const older = page.getByRole("link", { name: "更早" });
    await expect(older).toBeVisible();
    await older.click();
    await expect(page).toHaveURL(/cursors=/);
    await expect(page.getByRole("heading", { name: "安全看板" })).toBeVisible();
    await expect(page.getByRole("link", { name: "较新" })).toBeVisible();
  });
});
