import "server-only";
import { prisma } from "@/lib/db";
import { POINTS_PAGE_SIZE } from "@/constants/pagination";
import { paginate } from "@/lib/pagination";

/** 积分页与 /api/account/points 共用取数(余额 + 流水分页) */
export type PointTxRow = {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  remark: string | null;
  createdAt: string;
};

export type PointsPageData = {
  /** null = 账本不可得,视图走错误态,不伪造 0 */
  balance: number | null;
  page: number;
  totalPages: number;
  transactions: PointTxRow[];
};

export async function getPointBalance(userId: bigint): Promise<number | null> {
  const account = await prisma.pointAccount.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return account?.balance ?? null;
}

export async function getPointsPage(
  userId: bigint,
  rawPage = 1,
  pageSize = POINTS_PAGE_SIZE,
): Promise<PointsPageData> {
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
  const balance = await getPointBalance(userId);
  if (balance === null) return { balance: null, page, totalPages: 1, transactions: [] };

  const [total, rows] = await Promise.all([
    prisma.pointTransaction.count({ where: { userId } }),
    prisma.pointTransaction.findMany({
      where: { userId },
      orderBy: { id: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        remark: true,
        refId: true,
        createdAt: true,
      },
    }),
  ]);

  // 商店消费记录补充商品名 × 数量(issue #31):备注形如「订单 M…」,回查订单明细
  const orderNos = rows
    .map((t) => ORDER_REMARK_RE.exec(t.remark ?? "")?.[1])
    .filter((v): v is string => !!v);
  const orders = orderNos.length
    ? await prisma.order.findMany({
        where: { orderNo: { in: orderNos } },
        select: { orderNo: true, items: { select: { name: true, qty: true } } },
      })
    : [];
  const itemsByOrderNo = new Map(
    orders.map((o) => [o.orderNo, o.items.map((i) => `${i.name}×${i.qty}`)]),
  );

  return {
    balance,
    page,
    totalPages: paginate(total, page, pageSize).totalPages,
    transactions: rows.map((t) => ({
      id: t.id.toString(),
      type: t.type,
      amount: t.amount,
      balanceAfter: t.balanceAfter,
      remark: formatRemark(t.remark, t.refId, itemsByOrderNo),
      createdAt: t.createdAt.toISOString(),
    })),
  };
}

const ORDER_REMARK_RE = /^订单\s+(\S+)/;

/** 历史 mycred 流水备注带未替换的 %order_id% 占位符(issue #32):用 ref_id 回填 */
function formatRemark(
  remark: string | null,
  refId: bigint | null,
  itemsByOrderNo: Map<string, string[]>,
): string | null {
  if (!remark) return null;
  if (remark.includes("%order_id%")) {
    if (refId !== null) return remark.replace(/%order_id%/g, refId.toString());
    return remark.replace(/\s*[:：#]*\s*%order_id%/g, "").trim() || null;
  }
  const orderNo = ORDER_REMARK_RE.exec(remark)?.[1];
  const items = orderNo ? itemsByOrderNo.get(orderNo) : undefined;
  if (items?.length) return `${remark} · ${items.join("、")}`;
  return remark;
}
