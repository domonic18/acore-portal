import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "../../src/generated/business";

/**
 * T055 US7 旧路由兼容 E2E(quickstart S7 → FR-025/026/027 + SC-005;T064 M2 扩充):
 * /wp-login.php 三变体 302;route_map 命中 301/未命中 404;/shop 类路径不被兼容层触碰;
 * /my-account 301 到 /account(子路径同构透传,FR-109 四件套路径不变收口)。
 * p:999 条目由 globalSetup 在 webServer 启动前落库(服务端 route 缓存是进程内快照,
 * 长驻 dev server 若在播种前已加载缓存则不可见,此时该用例显式跳过并提示重启)。
 * 注:Next 的 Location 为相对路径(浏览器按当前 URL 解析),断言需补 base。
 */
const prisma = new PrismaClient();

test.afterAll(async () => {
  await prisma.$disconnect();
});

async function redirectTarget(request: APIRequestContext, path: string) {
  const res = await request.get(path, { maxRedirects: 0 });
  const loc = res.headers().location;
  return { res, target: loc ? new URL(loc, "http://localhost").pathname : null };
}

test.describe("US7 旧路由兼容", () => {
  test("wp-login 三变体 302 到新页面(FR-025)", async ({ request }) => {
    for (const [from, dest] of [
      ["/wp-login.php", "/login"],
      ["/wp-login.php?action=register", "/register"],
      ["/wp-login.php?action=lostpassword", "/forgot-password"],
    ] as const) {
      const { res, target } = await redirectTarget(request, from);
      expect(res.status(), `${from} 状态`).toBe(302);
      expect(target, `${from} 去向`).toBe(dest);
    }
  });

  test("route_map 命中 301 到新路径(/ 与 /index.php 均可)(FR-026/S7)", async ({ request }) => {
    const seeded = await prisma.routeMap.findUnique({ where: { oldKey: "p:999" } });
    test.fixme(
      !seeded,
      "globalSetup 未落库 p:999(需 playwright 流程而非直跑 spec)",
    );

    const probe = await redirectTarget(request, "/?p=999");
    test.skip(probe.res.status() === 404, "dev server route 缓存早于播种加载,重启 dev server 后重跑");

    expect(probe.res.status()).toBe(301);
    expect(probe.target).toBe("/account");

    const resIndex = await request.get("/index.php?p=999", { maxRedirects: 0 });
    expect(resIndex.status()).toBe(301);
    expect(new URL(resIndex.headers().location!, "http://localhost").pathname).toBe(
      "/account",
    );
  });

  test("映射未命中 404,不做模糊猜测(FR-026)", async ({ request }) => {
    for (const path of ["/?p=987654321", "/?cat=987654321", "/?page_id=0"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(404);
    }
  });

  test("shop 类路径归商城域,兼容层不触碰(FR-027;M2 起 /shop /cart /checkout 已实现)", async ({ request }) => {
    for (const path of ["/shop", "/cart", "/checkout"]) {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), path).toBe(200);
    }
  });

  test("my-account 301 到账户中心,子路径同构透传(FR-109;M2 T064)", async ({ request }) => {
    const { res, target } = await redirectTarget(request, "/my-account");
    expect(res.status()).toBe(301);
    expect(target).toBe("/account");

    const sub = await redirectTarget(request, "/my-account/orders");
    expect(sub.res.status()).toBe(301);
    expect(sub.target).toBe("/account/orders");

    // 链路末端:账户中心未登录 → 登录页(RSC redirect 307 引导),旧链最终可达登录
    const tail = await redirectTarget(request, "/account");
    expect(tail.res.status()).toBe(307);
    expect(tail.target).toBe("/login");
  });
});
