import "server-only";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { PRODUCT_STATUS } from "@/constants/shop";
import { POINT_TX_TYPE } from "@/constants/points";
import { effectivePrice } from "@/server/services/catalog/products";
import { debitLedger, LedgerError } from "@/server/services/points/ledger";

/**
 * 结账单事务(research R2/契约 POST /api/checkout):
 * 用户行 FOR UPDATE 互斥(data-model §5)→ 条件扣余额+shop_payment 流水(LedgerError→402 不建单)
 * → 建 Order(paid)+行快照 → 条件扣库存(超卖 409 整体回滚)→ 清车。
 * 促销价以事务内服务端 now() 生效价取值(FR-115);发货在事务外异步驱动。
 */

export type CheckoutErrorCode =
  | "CART_EMPTY"
  | "PRODUCT_UNAVAILABLE"
  | "OUT_OF_STOCK";

export class CheckoutError extends Error {
  constructor(public code: CheckoutErrorCode) {
    super(`checkout_error: ${code}`);
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

export async function checkoutCart(userId: bigint): Promise<CheckoutResult> {
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
