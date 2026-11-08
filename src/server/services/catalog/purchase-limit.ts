import "server-only";
import type { OrderStatus, Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/**
 * 商品限购占用计数(FR 二期):
 *
 * 物品类——**累计口径**:已购即占额(未取消且未退款的订单)。
 *   退款/取消的积分已退还,不计入限购额度,否则用户会因退单永久占额。
 * 服务类——**在途口径**:仅未完成的订单占额(paid/delivering/delivery_failed),
 *   发货完成(completed)即释放额度 ⇒ 改名服务发货完成后还能再改名一次
 *   (单次限购 1 件,结算使用后可再次购买)。
 */

const ITEM_OCCUPIED_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.DELIVERING,
  ORDER_STATUS.DELIVERY_FAILED,
  ORDER_STATUS.COMPLETED,
] as const;

const SERVICE_OCCUPIED_STATUSES: OrderStatus[] = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.DELIVERING,
  ORDER_STATUS.DELIVERY_FAILED,
] as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** 参与限购计数的商品(类型决定占用口径) */
export type LimitScopedProduct = {
  id: bigint;
  type: "game_item" | "service";
};

async function sumByProduct(
  db: Db,
  userId: bigint,
  productIds: bigint[],
  statuses: readonly OrderStatus[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const groups = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: { userId, status: { in: [...statuses] } },
    },
    _sum: { qty: true },
  });
  return new Map(groups.map((g) => [g.productId.toString(), g._sum?.qty ?? 0]));
}

/** 返回 productId(string)→ 该用户已占用的限购件数;未命中商品不出现在 Map(视作 0) */
export async function getUserPurchasedQty(
  db: Db,
  userId: bigint,
  products: LimitScopedProduct[],
): Promise<Map<string, number>> {
  if (products.length === 0) return new Map();
  const serviceIds = products.filter((p) => p.type === "service").map((p) => p.id);
  const itemIds = products.filter((p) => p.type !== "service").map((p) => p.id);
  const [serviceUsage, itemUsage] = await Promise.all([
    sumByProduct(db, userId, serviceIds, SERVICE_OCCUPIED_STATUSES),
    sumByProduct(db, userId, itemIds, ITEM_OCCUPIED_STATUSES),
  ]);
  return new Map([...serviceUsage, ...itemUsage]);
}
