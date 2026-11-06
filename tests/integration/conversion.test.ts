import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { CONVERSION_EVENT } from "@/constants/conversion";
import { recordConversion } from "@/server/services/shared/conversion";
import { getConversionFunnel } from "@/server/services/stats/funnel";
import { POST as productViewRoute } from "@/app/api/shop/product-view/route";

/**
 * 转化埋点集成(product_view→add_cart→order):
 * recordConversion 三类落库(view 匿名/order 带 orderId);24h 窗口外不计;
 * funnel 三计数+两比率(基线差值法);上报路由 200/404/422/限速 429。
 * redis 键 RUN 后缀隔离,用后清理。
 */
const RUN = Date.now().toString(36);
const SLUG = `cv-${RUN}`;
// 客户端 IP 走 XFF 右起 1 跳解析(PR-A),须为合法 IP;第三段与其它集成文件错开
const RL_IP = `203.2.${Number.parseInt(RUN, 36) % 254}.10`;

function viewReq(productId: number | string, ip?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (ip) headers.set("x-forwarded-for", ip);
  return new NextRequest("http://localhost/api/shop/product-view", {
    method: "POST",
    body: JSON.stringify({ productId }),
    headers,
  });
}

let productId = 0n;
let baseline: Awaited<ReturnType<typeof getConversionFunnel>>;

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  baseline = await getConversionFunnel();

  const category = await prisma.productCategory.create({
    data: { name: `CV 分类 ${RUN}`, slug: SLUG, sort: 99 },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      sku: `cvtest_${RUN}`,
      slug: SLUG,
      name: `CV 商品 ${RUN}`,
      description: "转化埋点集成 fixture",
      type: "game_item",
      status: "published",
      price: 100,
      categoryId: category.id,
    },
    select: { id: true },
  });
  productId = product.id;
});

afterAll(async () => {
  await redis.del(`rl:pview:${RL_IP}`);
  await prisma.conversionEvent.deleteMany({ where: { productId } });
  await prisma.product.deleteMany({ where: { slug: SLUG } });
  await prisma.productCategory.deleteMany({ where: { slug: SLUG } });
  await redis.quit();
  await prisma.$disconnect();
});

describe("转化埋点 recordConversion", () => {
  it("三类事件落库:view 匿名/add_cart 带 qty/order 带 orderId", async () => {
    await recordConversion({ type: CONVERSION_EVENT.PRODUCT_VIEW, productId });
    await recordConversion({
      type: CONVERSION_EVENT.ADD_CART,
      productId,
      userId: 9527n,
      qty: 2,
    });
    await recordConversion({
      type: CONVERSION_EVENT.ORDER,
      productId,
      userId: 9527n,
      qty: 2,
      orderId: 12345n,
    });

    const rows = await prisma.conversionEvent.findMany({
      where: { productId },
      select: { type: true, userId: true, qty: true, orderId: true },
    });
    expect(rows).toHaveLength(3);
    const view = rows.find((r) => r.type === CONVERSION_EVENT.PRODUCT_VIEW)!;
    expect(view.userId).toBeNull();
    expect(view.orderId).toBeNull();
    const cart = rows.find((r) => r.type === CONVERSION_EVENT.ADD_CART)!;
    expect(cart.userId).toBe(9527n);
    expect(cart.qty).toBe(2);
    const order = rows.find((r) => r.type === CONVERSION_EVENT.ORDER)!;
    expect(order.orderId).toBe(12345n);
  });
});

describe("转化漏斗 getConversionFunnel", () => {
  it("24h 内三计数(基线差值)与比率自洽;窗口外不计", async () => {
    // 追加 2 条浏览,使窗口内 view=3/cart=1/order=1(比率 33.3% / 100%)
    await recordConversion({ type: CONVERSION_EVENT.PRODUCT_VIEW, productId });
    await recordConversion({ type: CONVERSION_EVENT.PRODUCT_VIEW, productId });
    // 窗口外一条(25h 前)不应计入
    const stale = await prisma.conversionEvent.create({
      data: { type: "product_view", productId },
      select: { id: true },
    });
    await prisma.conversionEvent.update({
      where: { id: stale.id },
      data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) },
    });

    const funnel = await getConversionFunnel();
    expect(funnel.productView - baseline.productView).toBe(3);
    expect(funnel.addCart - baseline.addCart).toBe(1);
    expect(funnel.order - baseline.order).toBe(1);
    // 比率与同一快照的计数自洽(并行测试会并发写入,不做跨查询一致断言)
    if (funnel.productView > 0) {
      expect(funnel.viewToCart).toBe(
        Number(((funnel.addCart / funnel.productView) * 100).toFixed(1)),
      );
    }
    if (funnel.addCart > 0) {
      expect(funnel.cartToOrder).toBe(Number(((funnel.order / funnel.addCart) * 100).toFixed(1)));
    }
  });
});

describe("浏览上报路由 POST /api/shop/product-view", () => {
  it("合法上报 200 且落库;商品不存在 404;非法参数 422", async () => {
    const ok = await productViewRoute(viewReq(productId.toString()));
    expect(ok.status).toBe(200);

    const missing = await productViewRoute(viewReq(999999999));
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as { error: { code: string } }).error.code).toBe(
      "PRODUCT_NOT_FOUND",
    );

    const bad = await productViewRoute(
      new NextRequest("http://localhost/api/shop/product-view", {
        method: "POST",
        body: JSON.stringify({ productId: 0 }),
        headers: new Headers({ "content-type": "application/json" }),
      }),
    );
    expect(bad.status).toBe(422);
  });

  it("IP 轻限速:同 IP 第 31 次 429 RATE_LIMITED(30/60s)", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await productViewRoute(viewReq(productId.toString(), RL_IP));
      expect(res.status, `#${i}`).toBe(200);
    }
    const blocked = await productViewRoute(viewReq(productId.toString(), RL_IP));
    expect(blocked.status).toBe(429);
    expect(((await blocked.json()) as { error: { code: string } }).error.code).toBe("RATE_LIMITED");
  });
});
