import "server-only";
import { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { ORDER_STATUS } from "@/constants/shop";

/**
 * 商品销量/热销榜(二期商城增强):只统计未取消、未退款的订单行,
 * 收入=Σ(qty×unit_price 下单快照价)。SUM(qty×unit_price) 无法经 Prisma groupBy
 * 表达,统一走原始 SQL;qty/收入再做 Number() 归一(DECIMAL/BigInt)。
 *
 * 不用 Prisma.join/Prisma.empty 拼片段:Next RSC 打包后嵌套 Sql 片段可能不被
 * $queryRaw 识别而退化为占位参数(实测 1064 SQL 语法错),统一改为平铺参数。
 */
const SOLD_ORDER_STATUSES = [
  ORDER_STATUS.PAID,
  ORDER_STATUS.DELIVERING,
  ORDER_STATUS.DELIVERY_FAILED,
  ORDER_STATUS.COMPLETED,
] as const;

// 「全量」= 1970 起,省去有无 since 的两套 SQL
const START_OF_TIME = new Date(0);

export type ProductSalesItem = {
  productId: string;
  name: string;
  sku: string;
  soldQty: number;
  soldOrders: number;
  revenue: number;
};

type RawSalesRow = {
  product_id: bigint;
  sold_qty: bigint | number | Prisma.Decimal;
  sold_orders: bigint | number;
  revenue: bigint | number | Prisma.Decimal;
};

export async function getProductSales(opts: {
  limit: number;
  since?: Date;
}): Promise<{ totalUnits: number; top: ProductSalesItem[] }> {
  const since = opts.since ?? START_OF_TIME;
  const limit = Math.max(1, Math.floor(opts.limit));
  const [paid, delivering, deliveryFailed, completed] = SOLD_ORDER_STATUSES;

  const rows = await prisma.$queryRaw<RawSalesRow[]>`
    SELECT oi.product_id              AS product_id,
           SUM(oi.qty)                AS sold_qty,
           COUNT(DISTINCT oi.order_id) AS sold_orders,
           SUM(oi.qty * oi.unit_price) AS revenue
    FROM order_item oi
    JOIN shop_order o ON o.id = oi.order_id
    WHERE o.status IN (${paid}, ${delivering}, ${deliveryFailed}, ${completed})
      AND o.created_at >= ${since}
    GROUP BY oi.product_id
    ORDER BY sold_qty DESC
    LIMIT ${limit}
  `;

  const totalRows = await prisma.$queryRaw<{ total: bigint | number | Prisma.Decimal | null }[]>`
    SELECT COALESCE(SUM(oi.qty), 0) AS total
    FROM order_item oi
    JOIN shop_order o ON o.id = oi.order_id
    WHERE o.status IN (${paid}, ${delivering}, ${deliveryFailed}, ${completed})
      AND o.created_at >= ${since}
  `;

  const products =
    rows.length === 0
      ? []
      : await prisma.product.findMany({
          where: { id: { in: rows.map((r) => r.product_id) } },
          select: { id: true, name: true, sku: true },
        });
  const byId = new Map(products.map((p) => [p.id.toString(), p]));

  return {
    totalUnits: Number(totalRows[0]?.total ?? 0),
    top: rows.flatMap((r) => {
      const product = byId.get(r.product_id.toString());
      if (!product) return [];
      return [
        {
          productId: product.id.toString(),
          name: product.name,
          sku: product.sku,
          soldQty: Number(r.sold_qty),
          soldOrders: Number(r.sold_orders),
          revenue: Number(r.revenue),
        },
      ];
    }),
  };
}
