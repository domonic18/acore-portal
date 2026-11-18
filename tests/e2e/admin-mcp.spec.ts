import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/**
 * 商品运营 MCP E2E(二期 M6;规格 §17)
 *
 * 覆盖:后台签发令牌 → 明文一次性展示 → POST /api/mcp initialize/tools/list/tools/call;
 * 无令牌 401;只读令牌调写工具 403;吊销后令牌立即失效。
 */

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

  test("签发 → initialize / tools/list(7 个) / tools/call list_products", async ({
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
      "get_product",
      "list_categories",
      "list_products",
      "search_site",
      "set_product_status",
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
});
