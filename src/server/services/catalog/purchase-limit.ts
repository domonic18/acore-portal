import "server-only";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/**
 * 商品限购计数(FR 二期):有效购买 = 未取消且未退款的订单。
 * 退款/取消的积分已退还,不计入限购额度,否则用户会因退单永久占额。
 */
const PURCHASED_ORDER_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.DELIVERING,
  ORDER_STATUS.DELIVERY_FAILED,
  ORDER_STATUS.COMPLETED,
] as const;

type Db = Prisma.TransactionClient | typeof prisma;

/** 返回 productId(string)→ 该用户已购件数;未命中商品不出现在 Map(视作 0) */
export async function getUserPurchasedQty(
  db: Db,
  userId: bigint,
  productIds: bigint[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) return new Map();
  const groups = await db.orderItem.groupBy({
    by: ["productId"],
    where: {
      productId: { in: productIds },
      order: { userId, status: { in: [...PURCHASED_ORDER_STATUSES] } },
    },
    _sum: { qty: true },
  });
  return new Map(groups.map((g) => [g.productId.toString(), g._sum.qty ?? 0]));
}
