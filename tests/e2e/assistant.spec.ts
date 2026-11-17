import http from "node:http";
import type { AddressInfo } from "node:net";

import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { reloadServerConfig } from "./helpers/config-reload";

/**
 * AI 助手 E2E(M9 W7):右下角抽屉开合 + /search Agent 问答页接管 +
 * 真流问答闭环。llm chat 通道指向进程内 mock openai 协议端点(固定流式
 * 文本,忽略 tools),覆盖三段降级链:游客 401 横幅 / 通道未配 503 横幅 /
 * 配齐后 mock 流式回答渲染与新会话清空。llm 键用前快照、用后还原。
 */
const prisma = new PrismaClient();
const LLM_KEYS = ["llm.provider", "llm.baseUrl", "llm.apiKey", "llm.model", "llm.dailyQuota"];
const MOCK_ANSWER = "这是来自 mock 的流式回答。";

let llmBackup: { key: string; value: string }[] = [];
let adminToken = "";

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
  if (username === "m1admin") {
    const cookies = await page.context().cookies();
    adminToken = cookies.find((c) => c.name === "ap_access")?.value ?? "";
  }
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
  llmBackup = await prisma.systemConfig.findMany({
    where: { key: { in: LLM_KEYS } },
    select: { key: true, value: true },
  });
  // 先清掉历史配置,保证「通道未配」用例的真实性
  await prisma.systemConfig.deleteMany({ where: { key: { in: LLM_KEYS } } });
  mock = await startLlmMock();
});

test.afterAll(async () => {
  await prisma.systemConfig.deleteMany({ where: { key: { in: LLM_KEYS } } });
  if (llmBackup.length > 0) {
    await prisma.systemConfig.createMany({ data: llmBackup });
  }
  if (adminToken) {
    await reloadServerConfig(adminToken);
  }
  await mock.close();
  await prisma.$disconnect();
});

/** 配 llm 通道指向 mock 并触发服务端快照重载(adminToken 须已就绪) */
async function pointLlmAtMock(): Promise<void> {
  const values: Record<string, string> = {
    "llm.provider": "openai",
    "llm.baseUrl": `http://127.0.0.1:${mock.port}/v1`,
    "llm.apiKey": "e2e-mock-key",
    "llm.model": "mock-model",
    "llm.dailyQuota": "20",
  };
  for (const [key, value] of Object.entries(values)) {
    await prisma.systemConfig.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
  await reloadServerConfig(adminToken);
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
    await pointLlmAtMock();
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
