import "server-only";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS } from "@/constants/shop";
import { POINT_TX_TYPE } from "@/constants/points";
import { effectivePrice } from "@/server/services/catalog/products";
import { getUserPurchasedQty } from "@/server/services/catalog/purchase-limit";
import { debitLedger, LedgerError } from "@/server/services/points/ledger";
import { resolveGameAccountId } from "@/server/services/shared/game-identity";
import { validateCartParams } from "./param-schemas";
import type { ValidatedCartParams } from "./param-schemas";
import { resolveHandler } from "./handlers/registry";

/**
 * 结账单事务(research R2/契约 POST /api/checkout):
 * 支付前处理器 precheck(FR-120/123:离线恢复/占用名/目标账号不存在等 422 零写入)
 * → 用户行 FOR UPDATE 互斥(data-model §5)→ 条件扣余额+shop_payment 流水
 * (LedgerError→402 不建单)→ 建 Order(paid)+行快照 → 条件扣库存(超卖 409 整体回滚)→ 清车。
 * 促销价以事务内服务端 now() 生效价取值(FR-115);发货在事务外异步驱动。
 */

export type CheckoutErrorCode =
  | "CART_EMPTY"
  | "PRODUCT_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "PRECHECK_FAILED"
  | "PURCHASE_LIMIT_EXCEEDED";

export class CheckoutError extends Error {
  constructor(
    public code: CheckoutErrorCode,
    message?: string,
  ) {
    super(message ?? `checkout_error: ${code}`);
    this.name = "CheckoutError";
  }
}

export type CheckoutResult = { orderId: string; orderNo: string; pointCost: number };

type Tx = Prisma.TransactionClient;

/** orderNo = M2{YYYYMMDD}{6位序列}(data-model §2.4);定宽字典序 MAX 即当日最大序 */
async function nextOrderNo(tx: Tx): Promise<string> {
  const now = new Date();
  const ymd =
    `${now.getFullYear()}` +
    `${String(now.getMonth() + 1).padStart(2, "0")}` +
    `${String(now.getDate()).padStart(2, "0")}`;
  const prefix = `M2${ymd}`;
  const last = await tx.order.findFirst({
    where: { orderNo: { startsWith: prefix } },
    orderBy: { orderNo: "desc" },
    select: { orderNo: true },
  });
  const seq = last ? Number(last.orderNo.slice(-6)) + 1 : 1;
  return `${prefix}${String(seq).padStart(6, "0")}`;
}

const ORDER_NO_COLLISION_RETRIES = 3;

/**
 * 支付前关(FR-120/123,quickstart S4):全部行参数复核(schema 双重把关)+
 * 带 precheck 的处理器逐行前置(失败→PRECHECK_FAILED,结账响应携带处理器话术)。
 * 在事务外先行,零写入;发货时 driver 侧会再拦一次(双拦纵深)。
 */
async function runCheckoutPrechecks(userId: bigint): Promise<void> {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    include: { product: { select: { sku: true } } },
  });
  for (const row of rows) {
    if (!validateCartParams(row.product.sku, row.params).ok) {
      throw new CheckoutError(
        "PRECHECK_FAILED",
        "购物车中存在参数不完整的商品,请移除后重新加购。",
      );
    }
  }

  const prechecks: {
    sku: string;
    params: unknown;
    run: (ctx: {
      userId: bigint;
      username: string;
      gameAccountId: number;
      params: ValidatedCartParams;
    }) => Promise<void>;
  }[] = [];
  for (const row of rows) {
    const precheck = resolveHandler(row.product.sku)?.precheck;
    if (precheck) prechecks.push({ sku: row.product.sku, params: row.params, run: precheck });
  }
  if (prechecks.length === 0) return;

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { username: true },
  });
  const gameAccountId = await resolveGameAccountId(user.username);
  if (gameAccountId === null) {
    throw new CheckoutError("PRECHECK_FAILED", "游戏账号不存在,无法办理该服务。");
  }
  for (const { sku, params, run } of prechecks) {
    const parsed = validateCartParams(sku, params);
    if (!parsed.ok) {
      throw new CheckoutError("PRECHECK_FAILED", "商品参数不完整,请重新加购。");
    }
    try {
      await run({ userId, username: user.username, gameAccountId, params: parsed.params });
    } catch (err) {
      throw new CheckoutError(
        "PRECHECK_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export async function checkoutCart(userId: bigint): Promise<CheckoutResult> {
  await runCheckoutPrechecks(userId);
  // 单号由当日序生成,跨用户并发可能撞 unique:整体重试(重读购物车,幂等安全)
  let lastError: unknown;
  for (let attempt = 0; attempt < ORDER_NO_COLLISION_RETRIES; attempt += 1) {
    try {
      return await checkoutOnce(userId);
    } catch (err) {
      // 业务拦截(余额/库存/空车)不重试;单号唯一冲突(P2002)才重试
      if (err instanceof CheckoutError || err instanceof LedgerError) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

async function checkoutOnce(userId: bigint): Promise<CheckoutResult> {
  return prisma.$transaction(async (tx) => {
    // 同用户并发结账串行点(data-model §5)
    await tx.$queryRaw`SELECT id FROM user WHERE id = ${userId} FOR UPDATE`;

    const rows = await tx.cartItem.findMany({
      where: { userId },
      include: { product: true },
    });
    if (rows.length === 0) throw new CheckoutError("CART_EMPTY");

    const now = new Date();
    for (const r of rows) {
      if (r.product.status !== PRODUCT_STATUS.PUBLISHED) {
        throw new CheckoutError("PRODUCT_UNAVAILABLE");
      }
    }

    // 限购(事务内强制关):已购 + 本次购物车件数(同商品多行合并)> maxPerUser 即拦。
    // 插在扣分前,失败整体回滚零写入。
    const limited = rows.filter((r) => r.product.maxPerUser != null);
    if (limited.length > 0) {
      const cartQtyByProduct = new Map<string, number>();
      for (const r of rows) {
        const key = r.productId.toString();
        cartQtyByProduct.set(key, (cartQtyByProduct.get(key) ?? 0) + r.qty);
      }
      const purchased = await getUserPurchasedQty(
        tx,
        userId,
        limited.map((r) => r.productId),
      );
      for (const r of limited) {
        const key = r.productId.toString();
        const already = purchased.get(key) ?? 0;
        const requested = cartQtyByProduct.get(key) ?? 0;
        if (already + requested > r.product.maxPerUser!) {
          throw new CheckoutError(
            "PURCHASE_LIMIT_EXCEEDED",
            `商品「${r.product.name}」每人限购 ${r.product.maxPerUser} 件,您已购买 ${already} 件。`,
          );
        }
      }
    }

    const pointCost = rows.reduce(
      (sum, r) => sum + effectivePrice(r.product, now) * r.qty,
      0,
    );
    const orderNo = await nextOrderNo(tx);

    // 条件扣余额+流水(不足抛 LedgerError,事务整体回滚零写入)
    await debitLedger(tx, {
      userId,
      amount: pointCost,
      type: POINT_TX_TYPE.SHOP_PAYMENT,
      remark: `订单 ${orderNo}`,
    });

    const order = await tx.order.create({
      data: {
        orderNo,
        userId,
        status: "paid",
        pointCost,
        paidAt: now,
        items: {
          create: rows.map((r) => ({
            productId: r.productId,
            sku: r.product.sku,
            name: r.product.name,
            unitPrice: effectivePrice(r.product, now),
            qty: r.qty,
            params: (r.params ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true, orderNo: true },
    });

    // 条件扣库存(仅启库存商品):行锁条件更新,不足即超卖,整体回滚
    for (const r of rows) {
      if (!r.product.stockEnabled) continue;
      const updated = await tx.product.updateMany({
        where: { id: r.productId, stock: { gte: r.qty } },
        data: { stock: { decrement: r.qty } },
      });
      if (updated.count === 0) throw new CheckoutError("OUT_OF_STOCK");
    }

    await tx.cartItem.deleteMany({ where: { userId } });
    return { orderId: order.id.toString(), orderNo: order.orderNo, pointCost };
  });
}
