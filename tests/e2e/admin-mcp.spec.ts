import Redis from "ioredis";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "../../src/constants/audit";
import { resolveE2ERedisUrl } from "./redis-url";

/**
 * 商品运营 MCP E2E(二期 M6;规格 §17;M6 增补论坛运营工具)
 *
 * 覆盖:后台签发令牌 → 明文一次性展示 → POST /api/mcp initialize/tools/list/tools/call;
 * 无令牌 401;只读令牌调写工具 403;吊销后令牌立即失效;
 * 论坛工具链:list/get 读帖 → 官方回帖(floor 递增、作者=绑定管理员)→
 * 改标题(审计新旧)→ 下架软删(前台 404、回收站可见)。
 */

const prisma = new PrismaClient();
const redis = new Redis(resolveE2ERedisUrl());
/** 独立版块隔离(与 forum.spec 同思路,避免碰种子版块) */
const RUN = Date.now().toString(36);
const BOARD_SLUG = `e2emcp-${RUN}`;

const MCP_HEADERS = {
  "content-type": "application/json",
  accept: "application/json, text/event-stream",
};

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("用户名").fill(username);
  await page.getByLabel("密码", { exact: true }).fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/account\/overview$/);
}

/** MCP JSON-RPC 调用(无状态端点:每请求独立) */
async function mcpPost(
  request: APIRequestContext,
  body: unknown,
  token?: string,
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { ...MCP_HEADERS };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await request.post("/api/mcp", { headers, data: body as Record<string, unknown> });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status(), json };
}

/** 在后台签发一枚令牌并回传明文 */
async function issueToken(page: Page, scope: "read" | "write"): Promise<string> {
  await page.goto("/admin/mcp-tokens");
  const scopeSelect = page.getByLabel("令牌作用域");
  await expect(scopeSelect).toBeEnabled();
  await scopeSelect.selectOption(scope);
  await page.getByLabel("令牌有效天数").fill("30");
  await page.getByRole("button", { name: "签发新令牌" }).click();
  const plain = page.getByTestId("mcp-token-plain");
  await expect(plain).toBeVisible();
  return (await plain.textContent())?.trim() ?? "";
}

test("游客访问 /admin/mcp-tokens → 拦截回登录页", async ({ page }) => {
  await page.goto("/admin/mcp-tokens");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin%2Fmcp-tokens/);
});

test.describe.serial("商品运营 MCP 端点", () => {
  let adminUserId = 0n;

  test.beforeAll(async () => {
    const admin = await prisma.user.findUniqueOrThrow({
      where: { username: "m1admin" },
      select: { id: true },
    });
    adminUserId = admin.id;
    await prisma.forumBoard.create({
      data: { slug: BOARD_SLUG, name: `E2E MCP 论坛版块 ${RUN}`, sort: 96 },
    });
  });

  test.afterAll(async () => {
    await prisma.forumPost.deleteMany({ where: { thread: { board: { slug: BOARD_SLUG } } } });
    await prisma.forumThread.deleteMany({ where: { board: { slug: BOARD_SLUG } } });
    await prisma.forumBoard.deleteMany({ where: { slug: BOARD_SLUG } });
    redis.disconnect();
  });

  /** 只清 m1admin 自己的发帖频控(精确 key,不动并行 spec 其他用户的窗口) */
  async function clearAdminThreadRateLimit() {
    await redis.del(`rl:forum-thread-fast:${adminUserId}`, `rl:forum-thread-hour:${adminUserId}`);
  }

  test("无令牌 → 401", async ({ page, request }) => {
    await login(page, "m1admin", "adminpass123");
    const res = await mcpPost(request, {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "e2e", version: "0.0.0" },
      },
    });
    expect(res.status).toBe(401);
    expect(res.json?.error?.data?.code).toBe("UNAUTHORIZED");
  });

  test("签发 → initialize / tools/list(12 个) / tools/call list_products", async ({
    page,
    request,
  }) => {
    await login(page, "m1admin", "adminpass123");
    const token = await issueToken(page, "write");
    expect(token.startsWith("lokta_mcp_")).toBe(true);

    const init = await mcpPost(
      request,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "e2e", version: "0.0.0" },
        },
      },
      token,
    );
    expect(init.status).toBe(200);
    expect(init.json?.result?.serverInfo?.name).toBe("lokta-shop-admin");

    const list = await mcpPost(request, { jsonrpc: "2.0", id: 2, method: "tools/list" }, token);
    expect(list.status).toBe(200);
    const names = (list.json?.result?.tools ?? []).map((t: { name: string }) => t.name).sort();
    expect(names).toEqual([
      "create_product",
      "delete_forum_thread",
      "get_forum_thread",
      "get_product",
      "list_categories",
      "list_forum_threads",
      "list_products",
      "reply_forum_thread",
      "search_site",
      "set_product_status",
      "update_forum_thread_title",
      "update_product",
    ]);

    const call = await mcpPost(
      request,
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "list_products", arguments: { pageSize: 5 } },
      },
      token,
    );
    expect(call.status).toBe(200);
    expect(call.json?.result?.isError).toBeFalsy();
    const payload = JSON.parse(call.json.result.content[0].text);
    expect(Array.isArray(payload.items)).toBe(true);
  });

  test("只读令牌调写工具 → 403", async ({ page, request }) => {
    await login(page, "m1admin", "adminpass123");
    const token = await issueToken(page, "read");

    const call = await mcpPost(
      request,
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "create_product", arguments: { title: "e2e 只读越权" } },
      },
      token,
    );
    expect(call.status).toBe(403);
    expect(call.json?.error?.data?.code).toBe("FORBIDDEN");
  });

  test("吊销后令牌立即失效 → 401", async ({ page, request }) => {
    await login(page, "m1admin", "adminpass123");
    const token = await issueToken(page, "write");

    const ok = await mcpPost(request, { jsonrpc: "2.0", id: 5, method: "tools/list" }, token);
    expect(ok.status).toBe(200);

    await page.goto("/admin/mcp-tokens");
    await page.getByRole("button", { name: "吊销令牌" }).click();
    await page.getByRole("button", { name: "确认吊销" }).click();
    await expect(page.getByTestId("mcp-token-status")).toHaveText("未签发");

    const after = await mcpPost(request, { jsonrpc: "2.0", id: 6, method: "tools/list" }, token);
    expect(after.status).toBe(401);
  });

  test("超日配额 → 429", async ({ page, request }) => {
    await login(page, "m1admin", "adminpass123");

    // 把每日配额压到 1:同一枚新令牌当日第二次调用即超限
    const patched = await page.request.patch("/api/admin/mcp-token", {
      data: { dailyLimit: 1 },
    });
    expect(patched.status()).toBe(200);

    try {
      const token = await issueToken(page, "write");
      const call = () =>
        mcpPost(
          request,
          {
            jsonrpc: "2.0",
            id: 7,
            method: "tools/call",
            params: { name: "list_products", arguments: { pageSize: 1 } },
          },
          token,
        );

      expect((await call()).status).toBe(200);
      const second = await call();
      expect(second.status).toBe(429);
      expect(second.json?.error?.data?.code).toBe("RATE_LIMITED");
    } finally {
      await page.request.patch("/api/admin/mcp-token", { data: { dailyLimit: 500 } });
    }
  });

  test("论坛工具链:list/get → 官方回帖 → 改题 → 下架(软删)", async ({ page, request }) => {
    await clearAdminThreadRateLimit();
    await login(page, "m1admin", "adminpass123");
    const token = await issueToken(page, "write");

    // 工具链连发 7 次调用,超默认 QPS(5 次/秒)会被 429 打断:测试期调高,完事还原
    const patchedQps = await page.request.patch("/api/admin/mcp-token", {
      data: { qpsLimit: 30 },
    });
    expect(patchedQps.status()).toBe(200);

    try {
      // 造靶帖(独立版块;走正常发帖 API 保证业务口径一致)
      const created = await page.request.post("/api/forum/threads", {
        data: {
          boardSlug: BOARD_SLUG,
          title: "e2e MCP 论坛工具链靶帖",
          content: "靶帖正文:账号被误封,申请解封。",
        },
      });
      expect(created.status()).toBe(200);
      const { threadId } = (await created.json()) as { threadId: string };
      expect(threadId).toBeTruthy();

      const call = (id: number, name: string, args: Record<string, unknown>) =>
        mcpPost(request, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, token);

      // 读:list_forum_threads 按版块定位靶帖
      const list = await call(10, "list_forum_threads", { boardSlug: BOARD_SLUG });
      expect(list.status).toBe(200);
      expect(list.json?.result?.isError).toBeFalsy();
      const listPayload = JSON.parse(list.json.result.content[0].text);
      expect(listPayload.items.some((t: { id: string }) => t.id === threadId)).toBe(true);

      // 读:get_forum_thread 读到主贴楼层(正文为 Markdown)
      const get = await call(11, "get_forum_thread", { id: threadId });
      expect(get.json?.result?.isError).toBeFalsy();
      const getPayload = JSON.parse(get.json.result.content[0].text);
      expect(getPayload.thread.id).toBe(threadId);
      expect(getPayload.posts[0].floor).toBe(1);
      expect(getPayload.posts[0].legacy).toBe(false);
      expect(getPayload.posts[0].content).toContain("申请解封");

      // 写:官方回帖 → floor=2,作者=令牌绑定的管理员
      const reply = await call(12, "reply_forum_thread", {
        id: threadId,
        content: "官方回复:已收到申诉,会在 24 小时内核实处理。",
      });
      expect(reply.json?.result?.isError).toBeFalsy();
      const replyPayload = JSON.parse(reply.json.result.content[0].text);
      expect(replyPayload.floor).toBe(2);
      expect(replyPayload.authorName).toBe("m1admin");

      // 写:改标题 + 审计记新旧标题
      const retitle = await call(13, "update_forum_thread_title", {
        id: threadId,
        title: "e2e MCP 改题后的申诉标题",
      });
      expect(retitle.json?.result?.isError).toBeFalsy();
      const titleAudit = await prisma.auditLog.findFirstOrThrow({
        where: { action: AUDIT_ACTION.FORUM_THREAD_TITLE_EDIT, category: AUDIT_CATEGORY.FORUM },
        orderBy: { id: "desc" },
      });
      const titlePayload = titleAudit.payloadJson as { threadId: string; oldTitle: string; newTitle: string };
      expect(titlePayload.threadId).toBe(threadId);
      expect(titlePayload.oldTitle).toBe("e2e MCP 论坛工具链靶帖");
      expect(titlePayload.newTitle).toBe("e2e MCP 改题后的申诉标题");

      // 写:下架(软删) → 前台 404,默认列表不见,回收站可见
      const del = await call(14, "delete_forum_thread", { id: threadId });
      expect(del.json?.result?.isError).toBeFalsy();
      const pageAfter = await request.get(`/forum/thread/${threadId}`);
      expect(pageAfter.status()).toBe(404);

      const listAfter = await call(15, "list_forum_threads", { boardSlug: BOARD_SLUG });
      const listAfterPayload = JSON.parse(listAfter.json.result.content[0].text);
      expect(listAfterPayload.items.some((t: { id: string }) => t.id === threadId)).toBe(false);

      const listDeleted = await call(16, "list_forum_threads", {
        boardSlug: BOARD_SLUG,
        includeDeleted: true,
      });
      const listDeletedPayload = JSON.parse(listDeleted.json.result.content[0].text);
      expect(listDeletedPayload.items.some((t: { id: string }) => t.id === threadId)).toBe(true);
    } finally {
      await page.request.patch("/api/admin/mcp-token", { data: { qpsLimit: 5 } });
    }
  });
});
