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
  await page.getByLabel("标题(可空=纯图无文案)").fill(TITLE_A);
  await page.getByPlaceholder("/images/… 或 https://…").fill("/images/legacy-missing.svg");
  await page.getByRole("button", { name: "创建" }).click();
  const cardA = page.getByTestId("banner-card").filter({ hasText: TITLE_A });
  await expect(cardA).toBeVisible();

  // 再建一张(启用):首页轮播出现两张+圆点
  await page.getByRole("button", { name: "新建物料" }).click();
  await page.getByLabel("标题(可空=纯图无文案)").fill(TITLE_B);
  await page.getByPlaceholder("/images/… 或 https://…").fill("/images/legacy-missing.svg");
  await page.getByRole("button", { name: "创建" }).click();
  await expect(page.getByTestId("banner-card").filter({ hasText: TITLE_B })).toBeVisible();

  // ↑↓ 排序持久化(issue #50):B 上移后 sort 对调,再下移还原
  await page
    .getByTestId("banner-card")
    .filter({ hasText: TITLE_B })
    .getByRole("button", { name: "上移「" })
    .click();
  await expect
    .poll(
      async () =>
        await prisma.homeBanner.findFirstOrThrow({
          where: { title: TITLE_B },
          select: { sort: true },
        }),
    )
    .toEqual({ sort: 0 });
  await page
    .getByTestId("banner-card")
    .filter({ hasText: TITLE_B })
    .getByRole("button", { name: /下移「/ })
    .click();
  await expect
    .poll(
      async () =>
        await prisma.homeBanner.findFirstOrThrow({
          where: { title: TITLE_B },
          select: { sort: true },
        }),
    )
    .toEqual({ sort: 1 });

  await page.goto("/");
  await expect(page.getByRole("img", { name: TITLE_A })).toBeVisible();
  await expect(page.getByLabel("第 2 张")).toBeVisible();

  // 停用 A → 首页只剩 B
  await page.goto("/admin/home");
  const cardA2 = page.getByTestId("banner-card").filter({ hasText: TITLE_A });
  const switchA = cardA2.getByRole("switch");
  await expect(switchA).toBeEnabled();
  await switchA.click();
  await expect(page.getByTestId("banner-card").filter({ hasText: TITLE_A }).getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
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
  // 创建+停用必有;↑↓ 排序持久化(#50)亦各产生一条 A 的 sort 审计 → ≥2
  const auditsA = audits.filter((a) => (a.payloadJson as { title?: string }).title === TITLE_A);
  expect(auditsA.length).toBeGreaterThanOrEqual(2);
  expect(
    auditsA.some((a) => (a.payloadJson as { enabled?: boolean }).enabled === false),
  ).toBe(true);

  // 删除 A:确认弹窗 + 行消失 + 库清理
  await page.goto("/admin/home");
  await page.on("dialog", (d) => d.accept());
  await page
    .getByTestId("banner-card")
    .filter({ hasText: TITLE_A })
    .getByRole("button", { name: "删除" })
    .click();
  await expect(page.getByTestId("banner-card").filter({ hasText: TITLE_A })).toHaveCount(0);
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
  // 高度落在外层容器的 CSS 变量上(桌面端再由栅格拉伸成与右栏等高)
  await expect(
    page.getByTestId("home-achievement").locator('[style*="--achievement-height"]'),
  ).toHaveAttribute("style", /min\(120vh,\s*68vh\)/);
  // 滚动条默认开(2026-11-07):嵌入页内容常高于框高,关掉则底部内容看不见也滚不到
  await expect(frame).toHaveAttribute("scrolling", "auto");

  // 桌面端:成就块与右栏等高(栅格行高取两列内容高者,左列随右列拉伸)
  const achBox = await page.getByTestId("home-achievement").boundingBox();
  const sideBox = await page.getByTestId("home-side-column").boundingBox();
  expect(Math.abs((achBox?.height ?? 0) - (sideBox?.height ?? 0))).toBeLessThanOrEqual(2);

  // 取消滚动条 → scrolling=no;再勾回 → scrolling=auto
  await page.goto("/admin/home");
  const scrollCheck = page.getByLabel("显示滚动条");
  await expect(scrollCheck).toBeEnabled();
  await expect(scrollCheck).toHaveAttribute("aria-checked", "true");
  await scrollCheck.click();
  await expect(scrollCheck).toHaveAttribute("aria-checked", "false");
  await saveBtn.click();
  await expect(savedTip).toBeVisible();
  await page.goto("/");
  await expect(page.locator('iframe[title="最近成就"]')).toHaveAttribute("scrolling", "no");

  await page.goto("/admin/home");
  await scrollCheck.click();
  await expect(scrollCheck).toHaveAttribute("aria-checked", "true");
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

test("纯图 banner:标题留空可保存,首页渲染图片无文字叠层(WP 原站首页顶部特色图形态)", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  // 清扫历史失败运行遗留的空标题 banner(其存在会让轮播出现切换控件,与本断言无关)
  await prisma.homeBanner.deleteMany({ where: { title: "", sort: 99 } });

  const res = await page.request.post("/api/admin/banners", {
    data: { title: "", imageUrl: "/images/legacy-missing.svg", enabled: true, sort: 99 },
  });
  expect(res.status()).toBe(200);
  const bannerId = ((await res.json()) as { id: string }).id;

  try {
    await page.goto("/");
    const carSection = page.locator('section[aria-label="首页轮播"]');
    await expect(carSection.locator("img")).toBeVisible();
    // 空标题 → 无文字叠层
    await expect(carSection.locator("h2")).toHaveCount(0);
  } finally {
    await prisma.homeBanner.delete({ where: { id: BigInt(bannerId) } });
  }
});

/**
 * 轮播视频(2026-11-06):媒体库上传视频(服务端按 mime 落「视频」分类)→ 物料配
 * videoUrl → 首页静音循环播放(imageUrl 作封面/poster);视频解码失败回退封面图。
 * 上传内容为非真实视频字节:只打通「上传→分类→落库→content-type」链路,
 * 渲染断言靠拦截 mp4 请求使其挂起(解码失败会立即触发 error → 组件回退封面图)。
 */
test("轮播视频:上传入「视频」分类→首页静音循环播放,解码失败回退封面图", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page, "m1admin", "adminpass123");
  const title = `e2ebanner${RUN}-vid`;

  const upload = await page.request.post("/api/admin/media", {
    multipart: {
      files: {
        name: `clip-${RUN}.mp4`,
        mimeType: "video/mp4",
        buffer: Buffer.from(`fake-mp4-bytes-${RUN}`),
      },
    },
  });
  expect(upload.status()).toBe(201);
  const uploaded = (
    (await upload.json()) as {
      items: { id: string; url: string; category: string; cosKey: string }[];
    }
  ).items[0]!;
  // 服务端按 mime 强制落「视频」分类(不靠前端传分类名)
  expect(uploaded.category).toBe("视频");
  expect(uploaded.cosKey.endsWith(".mp4")).toBe(true);

  // 本地回退按扩展名还原 content-type:错类型 + nosniff = 浏览器直接拒播
  if (uploaded.url.startsWith("/uploads/")) {
    const asset = await page.request.get(uploaded.url);
    expect(asset.status()).toBe(200);
    expect(asset.headers()["content-type"]).toContain("video/mp4");
  }

  const created = await page.request.post("/api/admin/banners", {
    data: {
      title,
      imageUrl: "/images/legacy-missing.svg",
      videoUrl: uploaded.url,
      enabled: true,
      sort: 0,
    },
  });
  expect(created.status()).toBe(200);
  const bannerId = ((await created.json()) as { id: string }).id;

  try {
    // 拦截 mp4 请求使其挂起:保持 <video> 挂载,便于断言播放属性
    await page.route("**/*.mp4", () => {});
    await page.goto("/");
    const carSection = page.locator('section[aria-label="首页轮播"]');
    const videoState = () =>
      page.evaluate(() => {
        const v = document.querySelector<HTMLVideoElement>(
          'section[aria-label="首页轮播"] video',
        );
        if (!v) return null;
        return {
          muted: v.muted,
          loop: v.loop,
          autoplay: v.autoplay,
          playsInline: v.playsInline,
          poster: v.getAttribute("poster"),
          src: v.getAttribute("src"),
        };
      });
    await expect
      .poll(videoState, { timeout: 20_000, intervals: [200, 500] })
      .toMatchObject({
        muted: true,
        loop: true,
        autoplay: true,
        playsInline: true,
        poster: "/images/legacy-missing.svg",
        src: uploaded.url,
      });

    // 视频解码失败(内容非真实视频)→ 回退渲染封面图
    await page.unroute("**/*.mp4");
    await page.goto("/");
    await expect
      .poll(async () => carSection.locator(`img[alt="${title}"]`).count(), {
        timeout: 20_000,
        intervals: [200, 500],
      })
      .toBeGreaterThan(0);
  } finally {
    await page.unroute("**/*.mp4").catch(() => {});
    await prisma.homeBanner.delete({ where: { id: BigInt(bannerId) } });
    // 删除媒体资产:连带清掉本地文件(走接口,保证本地存储与行一起收)
    await page.request.delete(`/api/admin/media/${uploaded.id}`).catch(() => {});
    await prisma.mediaAsset.deleteMany({ where: { id: BigInt(uploaded.id) } });
  }
});
