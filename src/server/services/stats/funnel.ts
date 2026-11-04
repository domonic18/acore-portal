import "server-only";
import { prisma } from "@/lib/db";
import { CONVERSION_EVENT, type ConversionEventValue } from "@/constants/conversion";

export type ConversionFunnel = {
  productView: number;
  addCart: number;
  order: number;
  viewToCart: number;
  cartToOrder: number;
};

export const EMPTY_FUNNEL: ConversionFunnel = {
  productView: 0,
  addCart: 0,
  order: 0,
  viewToCart: 0,
  cartToOrder: 0,
};

const WINDOW_HOURS = 24;
const RATE_DECIMALS = 1;

function rate(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Number(((part / whole) * 100).toFixed(RATE_DECIMALS));
}

/** 转化漏斗(看板区块):近 24h 三事件计数 + 浏览→加购/加购→下单比率(分母 0=0) */
export async function getConversionFunnel(): Promise<ConversionFunnel> {
  const since = new Date(Date.now() - WINDOW_HOURS * 3600 * 1000);
  const rows = await prisma.conversionEvent.groupBy({
    by: ["type"],
    where: { createdAt: { gte: since } },
    _count: { _all: true },
  });
  const count = (type: ConversionEventValue) =>
    rows.find((r) => r.type === type)?._count._all ?? 0;

  const productView = count(CONVERSION_EVENT.PRODUCT_VIEW);
  const addCart = count(CONVERSION_EVENT.ADD_CART);
  const order = count(CONVERSION_EVENT.ORDER);
  return {
    productView,
    addCart,
    order,
    viewToCart: rate(addCart, productView),
    cartToOrder: rate(order, addCart),
  };
}
