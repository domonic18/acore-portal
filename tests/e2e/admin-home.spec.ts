import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * 首页配置 E2E(US 首页轮播+最近成就嵌入):
 * ① 越权:legacyuser 访问 /admin/home → middleware 重定向;POST /api/admin/banners 403;
 * ② 轮播闭环:新建→首页可见→停用→首页隐藏→删除;
 * ③ 成就嵌入:url/高度/滚动条三参数保存→首页 iframe 属性即时生效;url 清空→整块隐藏。
 * fixture:banners 按 RUN 前缀隔离,home.* 配置键用后删除(回落 flatten 默认)。
 */
const prisma = new PrismaClient();
const RUN = Date.now().toString(36);
const TITLE_A = `e2ebanner${RUN}-A`;
const TITLE_B = `e2ebanner${RUN}-B`;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  await prisma.homeBanner.deleteMany({ where: { title: { startsWith: `e2ebanner${RUN}` } } });
});

test.afterAll(async () => {
  // 审计取回后 JS 过滤(MySQL JsonFilter 不支持 path 数组语法)
  const audits = await prisma.auditLog.findMany({
    where: { action: { in: ["home_banner_saved", "home_banner_deleted", "settings_changed"] } },
    select: { id: true, payloadJson: true },
  });
  const ids = audits
    .filter((a) => {
      const p = a.payloadJson as { bannerId?: string; title?: string; group?: string };
      return p.group === "home" || p.title?.startsWith(`e2ebanner${RUN}`) === true;
    })
    .map((a) => a.id);
  if (ids.length) await prisma.auditLog.deleteMany({ where: { id: { in: ids } } });
  await prisma.homeBanner.deleteMany({ where: { title: { startsWith: `e2ebanner${RUN}` } } });
  await prisma.systemConfig.deleteMany({ where: { key: { startsWith: "home." } } });
  await prisma.$disconnect();
});

test("越权:普通用户访问 /admin/home 重定向+API 403", async ({ page }) => {
  await login(page, "legacyuser", "oldpass123");
  await page.goto("/admin/home");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fhome$/);
  const res = await page.request.post("/api/admin/banners", {
    data: { title: "x", imageUrl: "/images/x.png" },
  });
  expect(res.status()).toBe(403);
});

test("轮播闭环:新建→首页可见→停用隐藏→删除", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/home");

  const createBtn = page.getByRole("button", { name: "新建物料" });
  await expect(createBtn).toBeEnabled(); // hydration 同步点
  await createBtn.click();
  await page.getByLabel("标题", { exact: true }).fill(TITLE_A);
  await page.getByPlaceholder("/images/… 或 https://…").fill("/images/legacy-missing.svg");
  await page.getByRole("button", { name: "创建" }).click();
  const rowA = page.getByRole("row", { name: new RegExp(TITLE_A) });
  await expect(rowA).toBeVisible();

  // 再建一张(启用):首页轮播出现两张+圆点
  await page.getByRole("button", { name: "新建物料" }).click();
  await page.getByLabel("标题", { exact: true }).fill(TITLE_B);
  await page.getByPlaceholder("/images/… 或 https://…").fill("/images/legacy-missing.svg");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByRole("row", { name: new RegExp(TITLE_B) })).toBeVisible();

  await page.goto("/");
  await expect(page.getByRole("img", { name: TITLE_A })).toBeVisible();
  await expect(page.getByLabel("第 2 张")).toBeVisible();

  // 停用 A → 首页只剩 B
  await page.goto("/admin/home");
  const rowA2 = page.getByRole("row", { name: new RegExp(TITLE_A) });
  await expect(rowA2.getByRole("button", { name: "停用" })).toBeEnabled();
  await rowA2.getByRole("button", { name: "停用" }).click();
  await expect(rowA2.getByRole("button", { name: "启用" })).toBeEnabled();
  await page.goto("/");
  await expect(page.getByRole("img", { name: TITLE_B })).toBeVisible();
  await expect(page.getByRole("img", { name: TITLE_A })).toHaveCount(0);

  // 落库态 + 审计
  const saved = await prisma.homeBanner.findMany({ where: { title: { startsWith: `e2ebanner${RUN}` } } });
  expect(saved.map((b) => b.enabled).sort()).toEqual([false, true]);
  const audits = await prisma.auditLog.findMany({
    where: { action: "home_banner_saved" },
    select: { payloadJson: true },
  });
  expect(
    audits.filter((a) => (a.payloadJson as { title?: string }).title === TITLE_A),
  ).toHaveLength(2); // 创建+停用各一条

  // 删除 A:确认弹窗 + 行消失 + 库清理
  await page.goto("/admin/home");
  await page.on("dialog", (d) => d.accept());
  await rowA2.getByRole("button", { name: "删除" }).click();
  await expect(page.getByRole("row", { name: new RegExp(TITLE_A) })).toHaveCount(0);
  expect(await prisma.homeBanner.findFirst({ where: { title: TITLE_A } })).toBeNull();
});

test("成就嵌入:url/高度/滚动条配置→首页 iframe 即时生效", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/home");

  // /admin/home 有三处「保存」(物料行内编辑/轮播设置/成就嵌入),按 section 收窄
  const achSection = page.locator("section").filter({ hasText: "最近成就嵌入" });
  const saveBtn = achSection.getByRole("button", { name: "保存" });
  const savedTip = achSection.getByText("已保存,首页即时生效。");

  const urlInput = page.getByLabel("页面地址");
  await expect(urlInput).toBeEnabled();
  await urlInput.fill("https://rank.lokta.cn/achievement");
  await page.getByLabel("显示高度").fill("120vh");
  await saveBtn.click();
  await expect(savedTip).toBeVisible();

  await page.goto("/");
  const frame = page.locator('iframe[title="最近成就"]');
  await expect(frame).toHaveAttribute("src", "https://rank.lokta.cn/achievement");
  await expect(frame).toHaveAttribute("style", /height:\s*120vh/);
  await expect(frame).toHaveAttribute("scrolling", "no");

  // 勾选滚动条 → scrolling=auto
  await page.goto("/admin/home");
  const scrollCheck = page.getByLabel("显示滚动条");
  await expect(scrollCheck).toBeEnabled();
  await scrollCheck.check();
  await saveBtn.click();
  await expect(savedTip).toBeVisible();
  await page.goto("/");
  await expect(page.locator('iframe[title="最近成就"]')).toHaveAttribute("scrolling", "auto");

  // url 清空 → 整块隐藏
  await page.goto("/admin/home");
  const urlInput2 = page.getByLabel("页面地址");
  await expect(urlInput2).toBeEnabled();
  await urlInput2.fill("");
  await saveBtn.click();
  await expect(savedTip).toBeVisible();
  await page.goto("/");
  await expect(page.locator('iframe[title="最近成就"]')).toHaveCount(0);

  // 配置审计(group=home,只落键名 diff)
  const audits = await prisma.auditLog.findMany({
    where: { action: "settings_changed" },
    select: { payloadJson: true },
  });
  const homeAudits = audits.filter((a) => (a.payloadJson as { group?: string }).group === "home");
  expect(homeAudits.length).toBeGreaterThanOrEqual(3);
});

test("轮播间隔:越界 422 呈现;配置 2 秒→首页按新间隔自动切换", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "m1admin", "adminpass123");

  // 播种两张启用物料(RUN 前缀,afterAll 清)供首页轮播
  await prisma.homeBanner.createMany({
    data: [
      { title: `e2ebanner${RUN}-rotA`, imageUrl: "/images/legacy-missing.svg", linkUrl: "", sort: 1, enabled: true },
      { title: `e2ebanner${RUN}-rotB`, imageUrl: "/images/legacy-missing.svg", linkUrl: "", sort: 2, enabled: true },
    ],
  });

  await page.goto("/admin/home");
  const carSection = page.locator("section").filter({ hasText: "轮播设置" });
  const intervalInput = page.getByLabel("轮播间隔(秒)");
  const saveBtn = carSection.getByRole("button", { name: "保存" });
  await expect(intervalInput).toBeEnabled();

  // 越界 61 → 422 错误呈现
  await intervalInput.fill("61");
  await saveBtn.click();
  await expect(carSection.getByText("参数错误:carouselIntervalSec")).toBeVisible();

  // 2 秒 → 首页 ~2.6s 内必有一次切换
  await intervalInput.fill("2");
  await saveBtn.click();
  await expect(carSection.getByText("已保存,首页即时生效。")).toBeVisible();

  await page.goto("/");
  const prefix = `e2ebanner${RUN}`;
  const currentAlt = () =>
    page.evaluate(
      (p) => document.querySelector(`img[alt^="${p}"]`)?.getAttribute("alt") ?? null,
      prefix,
    );
  const first = await currentAlt();
  await page.waitForTimeout(2600);
  await expect.poll(currentAlt, { intervals: [500, 1000] }).not.toBe(first);

  // 落库态
  const row = await prisma.systemConfig.findUnique({
    where: { key: "home.carouselIntervalSec" },
    select: { value: true },
  });
  expect(row?.value).toBe("2");
});
