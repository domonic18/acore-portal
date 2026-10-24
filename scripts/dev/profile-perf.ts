// T065 本地性能 profile(M2 Polish;不设 CI 门,结果记 specs/002-m2-shop-points/perf-profile.md)
// 前置:dev server 已起(localhost:3000)、legacyuser 可登录、guid 10 角色存在
// 口径:GET /shop 完整 RSC 渲染(99 商品);POST /api/checkout 纯事务
//       (发货 fire-and-forget 不计,符合「不含发货」);临时商品 perf- 前缀用后即清,余额用后还原
import { config } from "dotenv";
config({ path: new URL("../../.env", import.meta.url).pathname });

import { PrismaClient } from "../../src/generated/business";

const prisma = new PrismaClient();
const BASE = process.env.PERF_BASE_URL ?? "http://localhost:3000";
const WARMUP = 3;
const N = 20;
const RUN = Date.now().toString(36);

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)]!;
}

function stats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    n: sorted.length,
    min: sorted[0]!,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]!,
  };
}

async function timed(url: string, init?: RequestInit): Promise<{ ms: number; res: Response }> {
  const t0 = performance.now();
  const res = await fetch(url, init);
  return { ms: performance.now() - t0, res };
}

async function main() {
  const shopMs: number[] = [];
  const checkoutMs: number[] = [];
  const orderIds: string[] = [];

  // ① /shop 列表(warmup 后连续计量)
  for (let i = 0; i < WARMUP + N; i++) {
    const { ms, res } = await timed(`${BASE}/shop`);
    if (res.status !== 200) throw new Error(`/shop 第 ${i} 次 status=${res.status}`);
    if (i >= WARMUP) shopMs.push(ms);
  }

  // ② 登录取会话 cookie
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "legacyuser", password: "oldpass123" }),
  });
  if (loginRes.status !== 200) throw new Error(`登录失败 status=${loginRes.status}`);
  const cookie = loginRes.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  const authHeaders = { cookie, "content-type": "application/json" };

  // ③ 临时商品(价格 2 分,余额压力最小)+ 余额提至上限,用后还原
  const legacy = await prisma.user.findUniqueOrThrow({
    where: { username: "legacyuser" },
    select: { id: true },
  });
  const originalBalance = (
    await prisma.pointAccount.findUnique({ where: { userId: legacy.id } })
  )?.balance;
  await prisma.pointAccount.upsert({
    where: { userId: legacy.id },
    update: { balance: 1_000_000 },
    create: { userId: legacy.id, balance: 1_000_000 },
  });
  const category = await prisma.productCategory.create({
    data: { name: "PERF 分类", slug: `perf-${RUN}`, sort: 99 },
    select: { id: true },
  });
  const product = await prisma.product.create({
    data: {
      sku: `itemsend_19061p${RUN}`,
      slug: `${category.slug}-p`,
      name: "PERF 计量商品",
      description: "T065 性能计量,用后即清",
      type: "game_item",
      status: "published",
      price: 2,
      gameItemId: 19061,
      categoryId: category.id,
    },
    select: { id: true },
  });

  try {
    for (let i = 0; i < WARMUP + N; i++) {
      const add = await fetch(`${BASE}/api/cart`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ productId: Number(product.id), qty: 1, params: { characterGuid: 10 } }),
      });
      if (add.status !== 200) throw new Error(`/api/cart 第 ${i} 次 status=${add.status}`);
      const { ms, res } = await timed(`${BASE}/api/checkout`, {
        method: "POST",
        headers: authHeaders,
        body: "{}",
      });
      const body = (await res.json()) as { orderId?: string };
      if (res.status !== 200 || !body.orderId) {
        throw new Error(`/api/checkout 第 ${i} 次 status=${res.status} body=${JSON.stringify(body)}`);
      }
      orderIds.push(body.orderId);
      if (i >= WARMUP) checkoutMs.push(ms);
    }
  } finally {
    // ④ 清理:等异步发货落库后,按审计依赖序删除(行→soap/审计→单→车→商品→余额)
    await new Promise((r) => setTimeout(r, 1_500));
    const orders = await prisma.order.findMany({
      where: { id: { in: orderIds.map((id) => BigInt(id)) } },
      select: { id: true, items: { select: { id: true } } },
    });
    for (const order of orders) {
      for (const item of order.items) {
        const prefix = `orderitem:${item.id}:`;
        await prisma.soapCall.deleteMany({ where: { idempotencyKey: { startsWith: prefix } } });
        await prisma.$executeRaw`
          DELETE FROM audit_log
          WHERE category = 'soap'
            AND JSON_UNQUOTE(JSON_EXTRACT(payload_json, '$.key')) LIKE ${`${prefix}%`}`;
      }
    }
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.cartItem.deleteMany({ where: { productId: product.id } });
    await prisma.product.delete({ where: { id: product.id } });
    await prisma.productCategory.delete({ where: { id: category.id } });
    if (originalBalance === undefined) {
      await prisma.pointAccount.deleteMany({ where: { userId: legacy.id } });
    } else {
      await prisma.pointAccount.update({
        where: { userId: legacy.id },
        data: { balance: originalBalance },
      });
    }
  }

  console.log(
    JSON.stringify(
      { shop: stats(shopMs), checkout: stats(checkoutMs) },
      (_k, v) => (typeof v === "number" ? Math.round(v * 10) / 10 : v),
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
