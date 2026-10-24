import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T043 US4 用户中心 E2E(quickstart S4 → SC-007):
 * legacyuser(3 角色)8 页逐一可达;角色页仅本人 3 角色;积分真实数据;订单友好空态;
 * 越权 guid → 403 CHARACTER_NOT_OWNED + 审计 ownership_violation;未登录 → /login 引导;昵称修改。
 */
const prisma = new PrismaClient();

const PAGES = [
  ["/account/overview", "账号总览"],
  ["/account/characters", "我的角色"],
  ["/account/points", "积分"],
  ["/account/orders", "订单"],
  ["/account/item-restore", "物品恢复"],
  ["/account/raf", "RAF 招募"],
  ["/account/settings", "账户设置"],
  ["/account/address", "收货地址"],
] as const;

/** 他人角色 fixture(account=2,LEGACYUSER 是 account=1)供越权 403 用 */
const TAMPER_GUID = 20;
const SEEDED_BALANCE = 7;

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill("legacyuser");
  await page.getByLabel("密码", { exact: true }).fill("oldpass123");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  // 游戏库只读(R5):fixture 经业务连接跨库写入(dev acore_portal 全库权限)
  await prisma.$executeRaw`
    INSERT INTO acore_characters.characters
      (guid, account, name, race, class, gender, level, map, zone, online, health)
    VALUES (${TAMPER_GUID}, 2, 'Notmine', 1, 4, 0, 10, 0, 0, 0, 100)
    ON DUPLICATE KEY UPDATE account = 2
  `;
  // 积分页真实数据 fixture:重建 legacyuser 账本(+1 笔 +7 流水,余额=SUM 保持账本不变量)
  const legacy = await prisma.user.findUniqueOrThrow({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  await prisma.pointTransaction.deleteMany({ where: { userId: legacy.id } });
  await prisma.pointAccount.deleteMany({ where: { userId: legacy.id } });
  await prisma.pointTransaction.create({
    data: {
      userId: legacy.id,
      type: "register_reward",
      amount: SEEDED_BALANCE,
      balanceAfter: SEEDED_BALANCE,
      remark: "测试种子流水",
    },
  });
  await prisma.pointAccount.create({
    data: { userId: legacy.id, balance: SEEDED_BALANCE },
  });
});

test.afterAll(async () => {
  await prisma.$executeRaw`
    DELETE FROM acore_characters.characters WHERE guid = ${TAMPER_GUID}
  `;
  const legacy = await prisma.user.findUnique({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  if (legacy) {
    await prisma.pointTransaction.deleteMany({ where: { userId: legacy.id } });
    await prisma.pointAccount.deleteMany({ where: { userId: legacy.id } });
  }
  await prisma.$disconnect();
});

test.describe("US4 用户中心(quickstart S4)", () => {
  test("8 页全部可达;角色页仅本人 3 角色;积分真实数据;订单空态", async ({
    page,
  }) => {
    await login(page);

    for (const [path, heading] of PAGES) {
      await page.goto(path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(
        page.getByRole("heading", { name: heading }),
      ).toBeVisible();
    }

    // 角色页:仅本人 3 角色(account=1 服务端过滤)
    await page.goto("/account/characters");
    await expect(page.getByText("Oldwarrior")).toBeVisible();
    await expect(page.getByText("Oldmage")).toBeVisible();
    await expect(page.getByText("Oldpriest")).toBeVisible();
    await expect(page.getByText("Notmine")).toHaveCount(0);
    expect(await page.locator("main ul > li").count()).toBe(3);

    // 积分页:余额与流水为库内真实数据
    await page.goto("/account/points");
    await expect(page.getByText(String(SEEDED_BALANCE)).first()).toBeVisible();
    await expect(page.getByText("测试种子流水")).toBeVisible();

    // 订单页:友好空态而非 404(FR-018)
    await page.goto("/account/orders");
    await expect(page.getByText("暂无订单")).toBeVisible();
  });

  test("物品恢复页:仅本人角色可选;列表只读展示", async ({ page }) => {
    await login(page);
    await page.goto("/account/item-restore");
    const select = page.getByLabel("选择角色");
    await expect(select).toBeVisible();
    // 下拉仅含本人 3 角色
    const options = await select.locator("option").allTextContents();
    expect(options).toHaveLength(3);
    expect(options.join()).toContain("Oldwarrior");
    expect(options.join()).not.toContain("Notmine");
    // 首个角色自动加载恢复列表(Oldwarrior guid=10 → 2 件;T040 起有模板显名/缺模板回退)
    await expect(page.getByText("测试坐骑·限量")).toBeVisible();
    await expect(page.getByText("物品 #17182")).toBeVisible();
  });

  test("越权 guid → 403 + 审计 ownership_violation;本人 guid 200", async ({
    page,
  }) => {
    await login(page);

    const bad = await page.request.get(
      `/api/account/restore-items?guid=${TAMPER_GUID}`,
    );
    expect(bad.status()).toBe(403);
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe(
      "CHARACTER_NOT_OWNED",
    );

    const good = await page.request.get("/api/account/restore-items?guid=10");
    expect(good.status()).toBe(200);
    expect(((await good.json()) as { items: unknown[] }).items).toHaveLength(2);

    const legacy = await prisma.user.findUniqueOrThrow({
      where: { username: "legacyuser" },
      select: { id: true },
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "ownership_violation", actorUserId: legacy.id },
      orderBy: { id: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.payloadJson as { guid?: number }).guid).toBe(TAMPER_GUID);
  });

  test("未登录直访 /account/* → 引导 /login", async ({ page }) => {
    await page.goto("/account/characters");
    await expect(page).toHaveURL(/\/login/);
  });

  test("昵称修改:成功保存;服务端拒绝过短昵称", async ({ page }) => {
    await login(page);
    await page.goto("/account/settings");
    await page.getByLabel(/昵称\(2-64/).fill("老克塔老玩家");
    await page.getByRole("button", { name: "保存昵称" }).click();
    await expect(page.locator("p[role=status]")).toContainText("昵称已更新");

    // HTML minLength 拦不住的路径走 API 直证服务端校验(共享 Cookie)
    const res = await page.request.patch("/api/account/profile", {
      data: { nickname: "x" },
    });
    expect(res.status()).toBe(422);
  });
});
