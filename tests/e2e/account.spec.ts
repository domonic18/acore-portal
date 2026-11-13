import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T043 US4 用户中心 E2E(quickstart S4 → SC-007):
 * legacyuser(3 角色)6 页逐一可达;角色页仅本人 3 角色;积分真实数据;订单友好空态;
 * 越权 guid → 403 CHARACTER_NOT_OWNED + 审计 ownership_violation;未登录 → /login 引导;昵称修改。
 */
const prisma = new PrismaClient();

const PAGES = [
  ["/account/overview", "账号总览"],
  ["/account/characters", "我的角色"],
  ["/account/points", "积分"],
  ["/account/orders", "订单"],
  ["/account/raf", "RAF 招募"],
  ["/account/settings", "账户设置"],
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
  test("6 页全部可达;角色页仅本人 3 角色;积分真实数据;订单空态", async ({
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

    // 登录后正文落在深色面板上(2026-10-29:不再透明直压页面背景图)
    await page.goto("/account/overview");
    const shellBg = await page
      .getByTestId("account-shell")
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(shellBg).not.toBe("rgba(0, 0, 0, 0)");

    // 角色页:仅本人 3 角色(account=1 服务端过滤)
    await page.goto("/account/characters");
    await expect(page.getByText("Oldwarrior")).toBeVisible();
    await expect(page.getByText("Oldmage")).toBeVisible();
    await expect(page.getByText("Oldpriest")).toBeVisible();
    await expect(page.getByText("Notmine")).toHaveCount(0);
    expect(await page.locator("main ul > li").count()).toBe(3);

    // 角色页:WoW 官方种族头像(按性别,移植自 acore-ranking 图标集)+ 种族/职业官方图标
    await expect(page.locator('img[alt="Oldwarrior 头像"]')).toHaveAttribute(
      "src",
      "/assets/icons/race/Ui-charactercreate-races_human-male.png",
    );
    await expect(page.locator('img[alt="Oldmage 头像"]')).toHaveAttribute(
      "src",
      "/assets/icons/race/Ui-charactercreate-races_gnome-female.png",
    );
    await expect(page.locator('img[alt="Oldpriest 头像"]')).toHaveAttribute(
      "src",
      "/assets/icons/race/Ui-charactercreate-races_bloodelf-male.png",
    );
    for (const crest of ["人类", "盗贼", "侏儒", "法师", "血精灵", "牧师"]) {
      await expect(page.getByRole("img", { name: crest })).toBeVisible();
    }
    // 文字不折行:角色行无横向溢出
    for (const row of await page.locator("main ul > li").all()) {
      expect(await row.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    }

    // 积分页:余额与流水为库内真实数据
    await page.goto("/account/points");
    await expect(page.getByText(String(SEEDED_BALANCE)).first()).toBeVisible();
    await expect(page.getByText("测试种子流水")).toBeVisible();

    // 订单页:友好空态而非 404(FR-018)
    await page.goto("/account/orders");
    await expect(page.getByText("暂无订单")).toBeVisible();
  });

  test("用户中心物品恢复/收货地址页已下线(2026-11-05);恢复 API 保留供商店服务商品", async ({
    page,
  }) => {
    await login(page);
    // 页面下线 → 404;恢复列表 API 仍在(商店装备恢复 SKU 依赖)
    const page1 = await page.goto("/account/item-restore");
    expect(page1?.status()).toBe(404);
    const page2 = await page.goto("/account/address");
    expect(page2?.status()).toBe(404);
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

  test("未设置昵称的账号:输入框留空占位,不回填用户名(#62)", async ({ page }) => {
    // m1admin 种子无昵称;此前页面把用户名当初始值填进昵称框,保存会把用户名固化成昵称
    await page.goto("/login");
    await page.getByLabel("用户名").fill("m1admin");
    await page.getByLabel("密码", { exact: true }).fill("adminpass123");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/account\/overview$/);
    await page.goto("/account/settings");
    const input = page.getByLabel(/昵称\(2-64/);
    await expect(input).toHaveValue("");
    await expect(input).toHaveAttribute("placeholder", "未设置");
  });

  test("页头头像与账号总览一致(名字缩略图非随机角色图);375px 信息区与积分表不折行", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/account/overview");

    // 页头头像 = 名字首字符缩略图(不再是随机角色图 ⇒ 无 <img>)
    const headerAvatar = page
      .getByTestId("user-menu-button")
      .getByTestId("user-avatar");
    await expect(page.getByTestId("user-menu-button").locator("img")).toHaveCount(0);
    const initial = (await headerAvatar.innerText()).trim();
    expect(initial.length).toBeGreaterThan(0);

    // 与账号总览头像同一口径(首字符与底色一致)
    const overviewAvatar = page.locator("main").getByTestId("user-avatar");
    await expect(overviewAvatar).toHaveText(initial);
    expect(
      await overviewAvatar.evaluate((el) => getComputedStyle(el).backgroundColor),
    ).toBe(
      await headerAvatar.evaluate((el) => getComputedStyle(el).backgroundColor),
    );

    // 375px:个人信息行标签/值同排单行,页面无横向溢出
    await page.setViewportSize({ width: 375, height: 812 });
    for (const row of await page.locator("main dl > div").all()) {
      expect(
        await row.evaluate((el) => Math.round(el.getBoundingClientRect().height)),
      ).toBeLessThanOrEqual(30);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    ).toBe(true);

    // 积分页:表头单行不折行,窄屏改横向滚动
    await page.goto("/account/points");
    const thHeights = await page
      .locator("thead th")
      .evaluateAll((els) =>
        els.map((e) => Math.round(e.getBoundingClientRect().height)),
      );
    expect(thHeights.length).toBe(5);
    expect(new Set(thHeights).size).toBe(1);
    expect(Math.max(...thHeights)).toBeLessThanOrEqual(45);
    expect(
      await page
        .locator("table")
        .first()
        .evaluate((el) => {
          const wrap = el.parentElement;
          return !!wrap && wrap.scrollWidth > wrap.clientWidth;
        }),
    ).toBe(true);
  });

  test("导航 tab 条:当前项下划线高亮;375px 单行横滚不折行(#63)", async ({ page }) => {
    await login(page);
    await page.goto("/account/settings");
    const nav = page.getByTestId("account-nav");
    const settingsTab = nav.getByRole("link", { name: "账户设置" });
    await expect(settingsTab).toHaveAttribute("aria-current", "page");
    // 当前项下划线指示条渲染
    await expect(settingsTab.locator("span")).toBeVisible();

    // 375px:6 项仍单行(横向滚动而非折成参差多行)
    await page.setViewportSize({ width: 375, height: 812 });
    const rows = await nav.locator("a").evaluateAll((els) => [
      ...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))),
    ]);
    expect(rows).toHaveLength(1);

    // 尾项仍可点(Playwright 自动滚入),点击后高亮随路由迁移
    await nav.getByRole("link", { name: "RAF 招募" }).click();
    await expect(page).toHaveURL(/\/account\/raf$/);
    await expect(nav.getByRole("link", { name: "RAF 招募" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(settingsTab).not.toHaveAttribute("aria-current", "page");
  });
});
