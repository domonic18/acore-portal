import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { hashPhpass } from "../../src/lib/auth/phpass";

/**
 * M4 用户角色权限管理 E2E:
 * ① m1admin 行内改角色 → 落库+审计+「会话已重置」提示;角色 tab 筛选;
 * ② 自改拒绝(422 SELF_ROLE_CHANGE 呈现,角色不变);
 * ③ legacyuser 越权 API 403。
 * fixture:RUN 后缀用户直写(phpass 哈希可登录),用后还原(含审计)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const USERNAME = `rolee2e${RUN}`;
const PASSWORD = "rolepass123";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

let userId = "";

test.beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      username: USERNAME,
      email: `${USERNAME}@test.local`,
      passwordHash: hashPhpass(PASSWORD),
      passwordAlgo: "phpass",
      role: "user",
    },
  });
  userId = user.id.toString();
});

test.afterAll(async () => {
  // MySQL JsonFilter 不支持 path 数组语法:取回后按 payload JS 过滤再删
  const audits = await prisma.auditLog.findMany({
    where: { action: "user_role_change" },
    select: { id: true, payloadJson: true },
  });
  const ids = audits
    .filter((a) => (a.payloadJson as { targetUserId?: string }).targetUserId === userId)
    .map((a) => a.id);
  if (ids.length) await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
  await prisma.user.deleteMany({ where: { username: USERNAME } });
  await prisma.$disconnect();
});

test("改角色落库+审计+会话重置提示;角色 tab 筛选", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/users");
  await page.getByLabel("用户名/昵称/邮箱搜索").fill(USERNAME);
  await page.getByRole("button", { name: "搜索" }).click();
  const row = page.getByRole("row", { name: new RegExp(USERNAME) });
  await expect(row).toBeVisible();

  const select = row.getByLabel("分配角色");
  await expect(select).toBeEnabled(); // hydration 同步点:水合前 select disabled,事件会丢
  await select.selectOption("moderator");
  await expect(row.getByText("已保存,该用户会话已重置")).toBeVisible();

  const db = await prisma.user.findUniqueOrThrow({ where: { id: BigInt(userId) } });
  expect(db.role).toBe("moderator");
  const audits = await prisma.auditLog.findMany({
    where: { action: "user_role_change" },
    orderBy: { id: "desc" },
    take: 20,
  });
  const audit = audits.find(
    (a) => (a.payloadJson as { targetUserId?: string }).targetUserId === userId,
  );
  expect(audit).toBeDefined();
  expect(audit!.payloadJson).toMatchObject({ oldRole: "user", newRole: "moderator" });

  // 角色 tab 筛选:moderator 下仅 fixture,m1admin 不在
  await page.getByRole("link", { name: "moderator", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/users\?role=moderator$/);
  await expect(page.getByRole("row", { name: new RegExp(USERNAME) })).toBeVisible();
  await expect(page.getByRole("row", { name: /m1admin/ })).toHaveCount(0);
});

test("自改拒绝:m1admin 改自己角色 → 422 提示且角色不变", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/users");
  await page.getByLabel("用户名/昵称/邮箱搜索").fill("m1admin");
  await page.getByRole("button", { name: "搜索" }).click();
  const row = page.getByRole("row", { name: /m1admin/ });
  const select = row.getByLabel("分配角色");
  await expect(select).toBeEnabled();
  await select.selectOption("user");
  await expect(row.getByRole("alert")).toContainText("不能修改自己的角色");

  const db = await prisma.user.findUniqueOrThrow({ where: { username: "m1admin" }, select: { role: true } });
  expect(db.role).toBe("admin");
});

test("越权:legacyuser 调角色 API 403", async ({ page }) => {
  await login(page, "legacyuser", "oldpass123");
  // page.request 与浏览器上下文共享 cookie:带 legacyuser 会话才能命中 403(无会话是 401)
  const res = await page.request.post(`/api/admin/users/${userId}/role`, {
    data: { role: "moderator" },
  });
  expect(res.status()).toBe(403);
});
