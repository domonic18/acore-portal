import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * AI 助手 E2E(M9 W7):右下角抽屉开合 + /search Agent 问答页接管 +
 * 真流问答闭环。chat 通道(LLM 通道重构后读 ai_model/ai_role_binding)指向
 * 进程内 mock openai 协议端点(固定流式文本,忽略 tools),覆盖三段降级链:
 * 游客 401 横幅 / 通道未绑 503 横幅 / 绑定后 mock 流式回答渲染与新会话清空。
 * 绑定行与 mock 条目用前快照、用后还原(resolver 每请求直查库,无需重载快照)。
 */
const prisma = new PrismaClient();
const MOCK_ANSWER = "这是来自 mock 的流式回答。";

let chatBindingBackup: { primaryId: number | null; backupId: number | null; dailyMax: number } | null = null;
let mockModelId = 0;

/** 进程内 mock openai 协议 /chat/completions:吐固定文本,末帧带 usage(审计聚合可非零) */
function startLlmMock(): Promise<{ close: () => Promise<void>; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.resume(); // 请求体(含 tools 定义)不消费内容
      req.on("end", () => {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const chunk = (delta: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
          res.write(
            `data: ${JSON.stringify({
              id: "chatcmpl-mock",
              object: "chat.completion.chunk",
              model: "mock",
              choices: [{ index: 0, delta, finish_reason: null }],
              ...extra,
            })}\n\n`,
          );
        chunk({ role: "assistant", content: "" });
        chunk({ content: MOCK_ANSWER });
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion.chunk",
            model: "mock",
            choices: [],
            usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
          })}\n\n`,
        );
        res.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-mock",
            object: "chat.completion.chunk",
            model: "mock",
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          })}\n\n`,
        );
        res.write("data: [DONE]\n\n");
        res.end();
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

async function login(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

let mock: { close: () => Promise<void>; port: number };

/**
 * composer 填充(规则 30 水合坑):水合前 fill 只落 DOM 不进 React 状态,
 * 发送按钮(enabled ⇔ composer 非空)恒 disabled 且页面无任何异常提示。
 * 以「按钮变 enabled」为水合信号,未就绪则重试 fill;dev 冷路由水合可慢数秒。
 */
async function fillComposer(page: Page, text: string): Promise<void> {
  const input = page.getByRole("textbox");
  const send = page.getByRole("button", { name: "发送" });
  for (let i = 0; i < 10; i++) {
    await input.fill(text);
    if (await send.isEnabled()) return;
    await page.waitForTimeout(500);
  }
  await expect(send).toBeEnabled();
}

test.beforeAll(async () => {
  const row = await prisma.aiRoleBinding.findUnique({ where: { role: "chat" } });
  chatBindingBackup = row
    ? { primaryId: row.primaryId, backupId: row.backupId, dailyMax: row.dailyMax }
    : null;
  // 先解绑,保证「通道未绑」用例的真实性
  await prisma.aiRoleBinding.upsert({
    where: { role: "chat" },
    update: { primaryId: null, backupId: null },
    create: { role: "chat", primaryId: null, backupId: null, dailyMax: 20 },
  });
  mock = await startLlmMock();
});

test.afterAll(async () => {
  await prisma.aiModel.deleteMany({ where: { id: mockModelId } });
  if (chatBindingBackup) {
    await prisma.aiRoleBinding.update({
      where: { role: "chat" },
      data: {
        primaryId: chatBindingBackup.primaryId,
        backupId: chatBindingBackup.backupId,
        dailyMax: chatBindingBackup.dailyMax,
      },
    });
  }
  await mock.close();
  await prisma.$disconnect();
});

/** 建 mock 模型条目并绑为 chat 主力(resolver 每请求直查库,改绑即时生效) */
async function bindChatAtMock(): Promise<void> {
  const model = await prisma.aiModel.create({
    data: {
      name: "e2e-mock-chat",
      provider: "mock",
      protocol: "openai",
      baseUrl: `http://127.0.0.1:${mock.port}/v1`,
      modelId: "mock-model",
      apiKey: "e2e-mock-key",
      roles: ["chat"],
      enabled: true,
      timeoutSec: 30,
    },
  });
  mockModelId = model.id;
  await prisma.aiRoleBinding.update({
    where: { role: "chat" },
    data: { primaryId: model.id, backupId: null, dailyMax: 20 },
  });
}

test.describe.serial("AI 助手(M9)", () => {
  test("游客抽屉发消息 → 401 横幅", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "打开 AI 助手" }).click();
    await expect(page.getByRole("dialog", { name: "AI 助手" })).toBeVisible();
    await fillComposer(page, "介绍一下站点");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("请先登录后使用助手")).toBeVisible();
  });

  test("登录后通道未配 → 503 横幅(降级提示不白屏)", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.getByRole("button", { name: "打开 AI 助手" }).click();
    await fillComposer(page, "介绍一下站点");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText("助手暂不可用")).toBeVisible();
  });

  test("配通道后 /search 接管为 Agent 问答页", async ({ page }) => {
    await bindChatAtMock();
    await page.goto("/search");
    await expect(page.getByRole("heading", { name: "问问老克塔助手" })).toBeVisible();
    await expect(page.getByText("站内内容问答 · 回答附来源链接")).toBeVisible();
    // 降级形态不应出现
    await expect(page.getByRole("searchbox", { name: "搜索关键词" })).toHaveCount(0);
  });

  test("提问 → mock 流式回答渲染", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/search");
    await fillComposer(page, "站内有什么攻略?");
    await page.getByRole("button", { name: "发送" }).click();
    await expect(page.getByText(MOCK_ANSWER).first()).toBeVisible({ timeout: 30_000 });
  });

  test("新会话按钮清空会话回空态", async ({ page }) => {
    await login(page, "m1admin", "adminpass123");
    await page.goto("/search");
    await page.getByRole("button", { name: "新会话" }).click();
    await expect(page.getByText("问点什么吧")).toBeVisible();
  });
});
