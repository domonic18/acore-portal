import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { pickOption } from "./helpers/ui";

/**
 * AI 模型管理台 E2E(LLM 通道重构):AI 管理页「模型」Tab /admin/ai/models 两区块——
 * ① 供应商预设预填(选 MiniMax 即预填 openai 协议 + 建议 Base URL + 模型 ID placeholder);
 * ② 模型条目表折叠行(新增/用途徽章/API Key 无鉴权/行内测试失败落库/删除保护);
 * ③ 角色绑定卡(对话/向量绑主力 + 定位徽章 + 停用主力 → /search 降级态);
 * ④ 设置页不再有「AI 模型」组。条目与绑定行用后清理还原。
 */
const prisma = new PrismaClient();
const GW_A = "E2E 网关A";
const GW_B = "E2E 网关B";
// 绑定卡选项文案 = `${modelId}(${provider})`,provider 取供应商预设名
const CHAT_OPTION = "e2e-aim-chat(MiniMax(国内版))";
const EMB_OPTION = "e2e-aim-emb(智谱 AI)";

let bindingBackup: { role: string; primaryId: number | null; backupId: number | null; dailyTokenMax: number }[] = [];

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

/** 条目行按钮无 disabled 门控,以绑定卡下拉「可选中」为整页水合信号(规则 30) */
async function waitHydrated(page: Page): Promise<void> {
  await expect(page.getByTestId("ai-binding-card-chat").getByLabel("主力模型")).toBeEnabled();
}

test.beforeAll(async () => {
  bindingBackup = await prisma.aiRoleBinding.findMany({
    select: { role: true, primaryId: true, backupId: true, dailyTokenMax: true },
  });
});

test.afterAll(async () => {
  // 绑定行先还原快照(创建的条目随解绑不再被引用),再清理本文件创建的条目
  for (const row of bindingBackup) {
    await prisma.aiRoleBinding.upsert({
      where: { role: row.role },
      create: row,
      update: { primaryId: row.primaryId, backupId: row.backupId, dailyTokenMax: row.dailyTokenMax },
    });
  }
  await prisma.aiRoleBinding.deleteMany({
    where: { role: { notIn: bindingBackup.map((r) => r.role) } },
  });
  await prisma.aiModel.deleteMany({ where: { modelId: { startsWith: "e2e-aim-" } } });
  await prisma.$disconnect();
});

test("游客访问 /admin/ai/models → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/ai/models");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fai%2Fmodels/);
});

test.describe.serial("admin AI 模型管理台", () => {
  test("NAV 入口 + 绑定卡与条目表渲染", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin");
    await expect(
      page.getByRole("banner").getByRole("navigation").getByRole("link", { name: "AI 管理" }),
    ).toHaveAttribute("href", "/admin/ai");
    await page.goto("/admin/ai/models");

    await expect(page.getByTestId("ai-binding-card-chat")).toBeVisible();
    await expect(page.getByTestId("ai-binding-card-embedding")).toBeVisible();
    await expect(page.getByText("静态选边")).toBeVisible();
    await expect(page.getByTestId("ai-model-create")).toBeVisible();
  });

  test("新增条目:供应商预设预填协议与 Base URL,保存后入表", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/ai/models");
    await waitHydrated(page);
    await page.getByTestId("ai-model-create").click();
    const form = page.getByTestId("ai-model-form-new");
    await expect(form).toBeVisible();

    // 选预设即预填:协议 openai + 建议 Base URL + 模型 ID placeholder
    await pickOption(form.getByLabel("供应商"), { label: "MiniMax(国内版)" });
    // Radix 触发器无 input value:断言触发器显示的协议文案
    await expect(form.getByLabel("协议")).toContainText("openai 兼容");
    await expect(form.getByLabel("Base URL")).toHaveValue("https://api.minimaxi.com/v1");
    await expect(form.getByLabel("模型 ID")).toHaveAttribute("placeholder", "MiniMax-Text-01");

    await form.getByLabel("名称").fill(GW_A);
    await form.getByLabel("模型 ID").fill("e2e-aim-chat");
    await form.getByTestId("ai-model-save").click();

    const row = page.getByRole("row", { name: new RegExp(GW_A) });
    await expect(row).toBeVisible();
    await expect(row).toContainText("MiniMax(国内版)");
    await expect(row).toContainText("无鉴权");
  });

  test("绑定对话/向量角色 → 定位徽章;向量用途锁 openai 协议", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/ai/models");
    await waitHydrated(page);

    // 第二条目:仅向量用途(协议下拉锁定 openai);先勾向量再取消对话(至少一项约束)
    await page.getByTestId("ai-model-create").click();
    const form = page.getByTestId("ai-model-form-new");
    // CheckChip 的 checkbox 是 sr-only(命中测试不可点),点标签文本切换
    await form.getByText("向量模型", { exact: true }).click();
    await form.getByText("对话模型", { exact: true }).click();
    await expect(form.getByLabel("协议")).toBeDisabled();
    // Radix 触发器无 input value:断言触发器显示的协议文案
    await expect(form.getByLabel("协议")).toContainText("openai 兼容");
    await form.getByLabel("名称").fill(GW_B);
    await pickOption(form.getByLabel("供应商"), { label: "智谱 AI" });
    await expect(form.getByLabel("Base URL")).toHaveValue("https://open.bigmodel.cn/api/paas/v4");
    await form.getByLabel("模型 ID").fill("e2e-aim-emb");
    await form.getByTestId("ai-model-save").click();
    await expect(page.getByRole("row", { name: new RegExp(GW_B) })).toBeVisible();

    // 对话卡绑主力(备用清空,防开发库既有绑定串扰)→ 行定位徽章「对话模型·主力」
    // 绑定卡下拉按规则 30 以「可选中」为水合信号
    const chatCard = page.getByTestId("ai-binding-card-chat");
    await expect(chatCard.getByLabel("主力模型")).toBeEnabled();
    await pickOption(chatCard.getByLabel("主力模型"), { label: CHAT_OPTION });
    await pickOption(chatCard.getByLabel("备用模型"), { label: "未绑定" });
    await chatCard.getByTestId("ai-binding-save-chat").click();
    await expect(chatCard.getByText("已保存")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(GW_A) })).toContainText("对话模型·主力");

    // 向量卡绑主力 → 行定位徽章「向量模型·主力」
    const embCard = page.getByTestId("ai-binding-card-embedding");
    await pickOption(embCard.getByLabel("主力模型"), { label: EMB_OPTION });
    await pickOption(embCard.getByLabel("备用模型"), { label: "未绑定" });
    await embCard.getByTestId("ai-binding-save-embedding").click();
    await expect(embCard.getByText("已保存")).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(GW_B) })).toContainText("向量模型·主力");
  });

  test("删除被绑定引用的条目 → 行内错误引导先解绑", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/ai/models");
    await waitHydrated(page);
    const row = page.getByRole("row", { name: new RegExp(GW_A) });
    await row.getByRole("button", { name: `删除「${GW_A}」` }).click();
    await expect(page.getByRole("alert").filter({ hasText: "请先在角色绑定中解绑" })).toBeVisible();
    await expect(row).toBeVisible();
  });

  test("停用对话主力 → /search 回关键词降级态;行内测试失败落库", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/ai/models");
    await waitHydrated(page);
    const row = page.getByRole("row", { name: new RegExp(GW_A) });

    // 行内测试(指向不可达端点)→ 失败徽章 + 库内落 last_test_*
    await row.getByRole("button", { name: "测试", exact: true }).click();
    await expect(page.getByRole("row", { name: new RegExp(GW_A) }).getByText("失败")).toBeVisible();
    const stored = await prisma.aiModel.findFirst({ where: { modelId: "e2e-aim-chat" } });
    expect(stored?.lastTestStatus).toBe("fail");

    // 停用主力(双位绑定无备用)→ 解析为 null → /search 回关键词降级态
    await row.getByRole("switch", { name: `启用「${GW_A}」` }).click();
    await expect(row.getByRole("switch", { name: `启用「${GW_A}」` })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.goto("/search");
    await expect(page.getByRole("searchbox", { name: "搜索关键词" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "问问小塔助手" })).toHaveCount(0);

    // 恢复启用(条目留在表里,后续用例解绑后删除)
    await page.goto("/admin/ai/models");
    await waitHydrated(page);
    await page
      .getByRole("row", { name: new RegExp(GW_A) })
      .getByRole("switch", { name: `启用「${GW_A}」` })
      .click();
    await expect(
      page
        .getByRole("row", { name: new RegExp(GW_A) })
        .getByRole("switch", { name: `启用「${GW_A}」` }),
    ).toHaveAttribute("aria-checked", "true");
  });

  test("解绑后删除两条目 → 行消失", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/ai/models");

    const chatCard = page.getByTestId("ai-binding-card-chat");
    await expect(chatCard.getByLabel("主力模型")).toBeEnabled();
    await pickOption(chatCard.getByLabel("主力模型"), { label: "未绑定" });
    await chatCard.getByTestId("ai-binding-save-chat").click();
    await expect(chatCard.getByText("已保存")).toBeVisible();

    const embCard = page.getByTestId("ai-binding-card-embedding");
    await expect(embCard.getByLabel("主力模型")).toBeEnabled();
    await pickOption(embCard.getByLabel("主力模型"), { label: "未绑定" });
    await embCard.getByTestId("ai-binding-save-embedding").click();
    await expect(embCard.getByText("已保存")).toBeVisible();

    for (const [name, modelId] of [
      [GW_A, "e2e-aim-chat"],
      [GW_B, "e2e-aim-emb"],
    ] as const) {
      const row = page.getByRole("row", { name: new RegExp(name) });
      await row.getByRole("button", { name: `删除「${name}」` }).click();
      await expect(row).toHaveCount(0);
      expect(await prisma.aiModel.findFirst({ where: { modelId } })).toBeNull();
    }
  });

  test("设置页不再有「AI 模型」组", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/admin/settings");
    await expect(page.getByTestId("settings-group-llm")).toHaveCount(0);
    // SMTP 组已随设置页拆 Tab 迁到「邮件与告警」页
    await page.goto("/admin/settings/mail");
    await expect(page.getByTestId("settings-group-smtp")).toBeVisible();
  });
});
