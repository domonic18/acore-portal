import { expect, test, type Page } from "@playwright/test";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { PrismaClient, type ProgressionNode } from "../../src/generated/business";

/**
 * 渐进计划后台 WYSIWYG E2E:
 * ① 游客访问 /admin/progression → 登录页;
 * ② admin 在渐进页同款时间轴上就地改标题/说明、新增阶段、↑ 调整顺序、钉当前指针 → 更新;
 * ③ /progression 即时渲染新顺序与当前阶段(画布=前台同一布局)。
 * progression_node / 指针为全局数据:用前快照、用后还原。
 */
const prisma = new PrismaClient();
const POINTER_KEY = "progression.current_node_id";
// 上传回退用例:1×1 透明 PNG;按原始名清理行与落盘文件
const UPLOAD_NAME = "e2e-progression-upload.png";
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

let nodeBackup: ProgressionNode[] = [];
let pointerBackup: string | null = null;

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

test.beforeAll(async () => {
  nodeBackup = await prisma.progressionNode.findMany({ orderBy: { sort: "asc" } });
  pointerBackup =
    (await prisma.systemConfig.findUnique({ where: { key: POINTER_KEY } }))?.value ?? null;
});

test.afterAll(async () => {
  const uploads = await prisma.mediaAsset.findMany({
    where: { originalName: UPLOAD_NAME },
    select: { cosKey: true },
  });
  await prisma.mediaAsset.deleteMany({ where: { originalName: UPLOAD_NAME } });
  for (const row of uploads) {
    await unlink(path.join(process.cwd(), "workspace", "uploads", row.cosKey)).catch(() => {});
  }
  await prisma.progressionNode.deleteMany();
  if (nodeBackup.length > 0) {
    await prisma.progressionNode.createMany({ data: nodeBackup });
  }
  if (pointerBackup === null) {
    await prisma.systemConfig.deleteMany({ where: { key: POINTER_KEY } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key: POINTER_KEY },
      update: { value: pointerBackup },
      create: { key: POINTER_KEY, value: pointerBackup },
    });
  }
  await prisma.$disconnect();
});

test("游客访问 /admin/progression → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/progression");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fprogression/);
});

test("admin 时间轴就地编辑+新增+排序+指针 → 前台即时生效", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/progression");
  await expect(page.getByTestId("progression-editor")).toBeVisible();

  const cards = page.locator('article[data-testid^="progression-card-"]');
  await expect(cards).toHaveCount(3);

  // 第一张卡原位编辑(与前台同款卡片,「编辑」展开表单)
  await cards.first().getByRole("button", { name: "编辑" }).click();
  await page.getByTestId("progression-title").fill("E2E 渐进改");
  await page.getByTestId("progression-body").fill("团本:●E2E 熔火之心");
  await page.getByRole("button", { name: "完成编辑" }).click();
  await expect(cards.first().getByRole("heading", { name: "E2E 渐进改" })).toBeVisible();

  // 新增阶段自动进入编辑态,填完关闭
  await page.getByTestId("progression-add").click();
  await page.getByTestId("progression-title").fill("E2E 新增阶段");
  await page.getByTestId("progression-body").fill("副本:●E2E 副本");
  await page.getByTestId("progression-status").selectOption("open");
  await page.getByRole("button", { name: "完成编辑" }).click();

  // 上移一位:数组顺序即时间轴顺序
  await cards.last().getByRole("button", { name: "上移阶段" }).click();

  // 当前阶段指针钉到第一张卡
  await page.getByTestId("progression-current").selectOption({ label: "E2E 渐进改" });
  await expect(page.getByTestId("progression-dirty")).toBeVisible();

  await page.getByTestId("progression-save").click();
  await expect(page.getByTestId("progression-saved")).toBeVisible();

  // 前台:同一渲染顺序 + 当前阶段指针
  await page.goto("/progression");
  const titles = (await page.locator("ol li[id^='node-'] h2").allInnerTexts()).map((t) =>
    t.trim(),
  );
  expect(titles[0]).toBe("E2E 渐进改");
  expect(titles[2]).toBe("E2E 新增阶段");
  const overview = page.getByRole("region", { name: "阶段概览" });
  await expect(overview.getByRole("link", { name: "E2E 渐进改" })).toBeVisible();
});

test("新增阶段上传配图:COS 未配置走本地上传并即插即显", async ({ page }) => {
  await login(page, "m1admin", "adminpass123");
  await page.goto("/admin/progression");
  await page.getByTestId("progression-add").click();

  await page.locator('input[type="file"]').setInputFiles({
    name: UPLOAD_NAME,
    mimeType: "image/png",
    buffer: PNG_1PX,
  });

  const preview = page.getByAltText("配图预览");
  await expect(preview).toBeVisible();
  const src = await preview.getAttribute("src");
  expect(src).toMatch(/^\/uploads\/media\/\d{8}\/[0-9a-f]{64}\.png$/);

  // 回退读取路由可直接取图(next start 不服务运行期新增 public 文件)
  const res = await page.request.get(src!);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("image/png");
});
