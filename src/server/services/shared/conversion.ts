import "server-only";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/business";
import { CONVERSION_EVENT, type ConversionEventValue } from "@/constants/conversion";

export type ConversionInput = {
  type: ConversionEventValue;
  productId: bigint;
  userId?: bigint | null;
  qty?: number | null;
  orderId?: bigint | null;
};

/**
 * 转化埋点写入(product_view→add_cart→order):观测数据,内部吞错——
 * 失败只漏一条事件,不得影响加购/下单主流程;支持事务 client(下单同事务)。
 */
export async function recordConversion(
  input: ConversionInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  try {
    await client.conversionEvent.create({
      data: {
        type: input.type,
        productId: input.productId,
        userId: input.userId ?? null,
        qty: input.qty ?? null,
        orderId: input.orderId ?? null,
      },
    });
  } catch {
    // 埋点失败静默,不影响主流程
  }
}

/** 浏览上报(匿名 beacon 入口):商品存在才落 product_view;false=商品不存在(路由映射 404) */
export async function recordProductView(productId: bigint): Promise<boolean> {
  const exists = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true },
  });
  if (!exists) {
    return false;
  }
  await recordConversion({ type: CONVERSION_EVENT.PRODUCT_VIEW, productId });
  return true;
}
