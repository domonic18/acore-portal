import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

/**
 * E2E 路由预热(2026-11-06 撞库加固 PR-H 收口):
 *
 * next dev 按需编译路由 —— 首次访问某路由时才编译,编译完成会推 HMR 更新,
 * 浏览器侧表现为「整页重载」。E2E 跑到一半才首次访问某路由时,重载会打断
 * 正在进行的交互:登录按钮点击落到尚未 hydrate 的 DOM → 走原生表单 GET 提交
 * (/login?...),表现为「登录后停在登录页」的偶发失败(trace 可见 [Fast Refresh] rebuilding)。
 *
 * 预热要覆盖两半:
 * - **服务端模块**:API handler 与页面 RSC —— 用 HTTP 请求打一遍即触发编译;
 * - **客户端 bundle**:只有真实浏览器加载页面才会编译 —— 用 Playwright 浏览器访问一遍。
 *   纯 fetch 只拿到 SSR HTML,浏览器端 chunk 仍会在跑测中途现编 → 重载照旧。
 *
 * 路由清单从 src/app 目录树推导(新增页面/接口自动纳入,无需手工维护)。
 */

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
/** 预热用的管理员账号(seed 脚本建的测试账号) */
const ADMIN = { username: "m1admin", password: "adminpass123" };
/** src/app 根目录 */
const APP_DIR = path.join(__dirname, "..", "..", "src", "app");
/** 单条路由预热的超时(毫秒) */
const ROUTE_TIMEOUT_MS = 30_000;

/** 目录树 → URL 路径:去掉路由组 `(x)`,动态段 `[id]`/`[...key]` 取样本值 "1" */
function toUrlPath(dir: string): string {
  const segments = dir
    .split(path.sep)
    .filter((s) => s.length > 0 && !(s.startsWith("(") && s.endsWith(")")));
  const url = segments
    .map((s) => (s.startsWith("[") ? "1" : s))
    .join("/");
  return url ? `/${url}` : "/";
}

/** 递归收集 src/app 下的页面路由与接口路由 */
function collectRoutes(): { pages: string[]; apis: string[] } {
  const pages = new Set<string>();
  const apis = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (entry.name === "page.tsx" || entry.name === "page.ts") {
        pages.add(toUrlPath(path.relative(APP_DIR, dir)));
      } else if (entry.name === "route.ts") {
        apis.add(toUrlPath(path.relative(APP_DIR, dir)));
      } else if (entry.name === "robots.ts") {
        pages.add("/robots.txt");
      } else if (entry.name === "sitemap.ts") {
        pages.add("/sitemap.xml");
      }
    }
  };
  walk(APP_DIR);
  return { pages: [...pages].sort(), apis: [...apis].sort() };
}

/**
 * 预热入口:服务端未就绪或登录失败时静默跳过(不阻断 E2E)——
 * 预热只是消除热更新干扰,失败只是回到「偶发 flake」的旧状态。
 */
export async function warmUp(): Promise<void> {
  const { pages, apis } = collectRoutes();
  let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null;
  let done = 0;
  try {
    browser = await chromium.launch();
    const context = await browser.newContext();
    // 开态档登录需人机验证 token,脚本拿不到 → 只预热公开路由(后台页仍会编译,只是渲染未登录态)
    if (process.env.E2E_TURNSTILE !== "1") {
      const res = await context.request.post(`${BASE_URL}/api/auth/login`, {
        data: ADMIN,
        timeout: ROUTE_TIMEOUT_MS,
      });
      await res.body();
    }
    // 先打接口:页面加载时会回调这些接口,先编译好可避免页面加载中途再编译
    for (const api of apis) {
      try {
        const res = await context.request.get(`${BASE_URL}${api}`, {
          maxRedirects: 0,
          timeout: ROUTE_TIMEOUT_MS,
        });
        await res.body();
        done += 1;
      } catch {
        // 单条路由失败(超时/连接错误)不影响其余预热
      }
    }
    // 再用浏览器访问页面:服务端 RSC 与客户端 chunk 一并编译
    const page = await context.newPage();
    for (const route of pages) {
      try {
        await page.goto(`${BASE_URL}${route}`, {
          waitUntil: "load",
          timeout: ROUTE_TIMEOUT_MS,
        });
        // 客户端 chunk 与首屏数据请求都在 load 前后完成;接口模块上一步已编译好,留少量余量即可
        await page.waitForTimeout(600);
        done += 1;
      } catch {
        // 页面未就绪(404/超时)不影响其余预热
      }
    }
    await page.close();
  } catch {
    // dev server 未就绪 / 浏览器启动失败 → 跳过预热
  } finally {
    await browser?.close().catch(() => {});
  }
  console.log(`[warmup] 预热路由 ${done}/${pages.length + apis.length} 条(dev server 按需编译前置)`);
}
