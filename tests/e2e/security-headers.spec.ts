import { expect, test } from "@playwright/test";

/**
 * 安全响应头(2026-11-07,应用层兜底):
 * 头设在 next.config.mjs,边缘(Caddy/前置 nginx)之外也必须成立——
 * 报告实测测试栈 0/6 命中,根因是测试栈根本没有边缘、门户应用层也不设头。
 *
 * CSP 只收「不破功能」的几条:门户要嵌子站与第三方工具站、加载验证码脚本,
 * 故不设 default-src/script-src;此处锁住已上线的这几条不被改回去。
 */

test("页面响应带安全响应头(CSP/frame-ancestors/X-Frame-Options 等)", async ({ page }) => {
  const res = await page.goto("/login");
  expect(res).not.toBeNull();
  const headers = res!.headers();

  const csp = headers["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("form-action 'self'");

  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
});

test("API 响应同样带安全响应头", async ({ request }) => {
  const res = await request.get("/api/status");
  expect(res.status()).toBe(200);
  const headers = res.headers();
  expect(headers["content-security-policy"] ?? "").toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
});
