import "server-only";
import { prisma } from "@/lib/db";
import { ORDER_STATUS, type OrderStatusValue } from "@/constants/shop";
import { ADMIN_ORDER_PAGE_SIZE } from "@/constants/pagination";
import { pageSlice, totalPageCount } from "@/lib/pagination";
import { listCharacterNamesByGuids } from "@/server/services/shared/game-identity";
import { readCharacterGuid } from "@/server/services/shop/param-schemas";

/**
 * 后台订单读模型(api-admin 契约,FR-129):
 * 订单列表/详情/最新订单/存量复核清单。写操作(补发/退款/复核落定)在 admin.ts。
 */

export async function listAdminOrders(opts: { status?: string; page?: number }): Promise<{
  orders: {
    id: string;
    orderNo: string;
    username: string;
    nickname: string | null;
    /**
     * 本单实际针对的游戏角色(取自各订单行的 params.characterGuid);
     * name 为 null = 角色已删除或角色库不可达(前端回落展示 guid)。
     * 刻意**不**展示账号名下的全部角色——那是账号维度的信息,与本单无关。
     */
    characters: { guid: number; name: string | null }[];
    status: OrderStatusValue;
    pointCost: number;
    itemCount: number;
    createdAt: string;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const status = (Object.values(ORDER_STATUS) as string[]).includes(opts.status ?? "")
    ? (opts.status as OrderStatusValue)
    : undefined;
  const where = status ? { status } : {};
  const { skip, take } = pageSlice(page, ADMIN_ORDER_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { id: "desc" },
      skip,
      take,
      select: {
        id: true,
        orderNo: true,
        status: true,
        pointCost: true,
        createdAt: true,
        user: { select: { username: true, nickname: true } },
        items: { select: { params: true } },
        _count: { select: { items: true } },
      },
    }),
  ]);
  // 用户列展示「账号 + 本单买给了哪个角色」:角色取自订单行自己的 params,
  // 角色名一次批量查(避免逐行查库);角色库不可达时降级为只展示 guid。
  const guidsByOrder = rows.map((o) => orderCharacterGuids(o.items.map((i) => i.params)));
  const namesByGuid = await loadCharacterNamesByGuids(guidsByOrder.flat());
  return {
    page,
    totalPages: totalPageCount(total, ADMIN_ORDER_PAGE_SIZE),
    total,
    orders: rows.map((o, i) => ({
      id: o.id.toString(),
      orderNo: o.orderNo,
      username: o.user.username,
      nickname: o.user.nickname,
      characters: (guidsByOrder[i] ?? []).map((guid) => ({
        guid,
        name: namesByGuid.get(guid) ?? null,
      })),
      status: o.status as OrderStatusValue,
      pointCost: o.pointCost,
      itemCount: o._count.items,
      createdAt: o.createdAt.toISOString(),
    })),
  };
}

/** 本单针对的角色 guid(取自各订单行的 params.characterGuid;去重保序) */
function orderCharacterGuids(paramsList: unknown[]): number[] {
  const seen = new Set<number>();
  const guids: number[] = [];
  for (const params of paramsList) {
    const guid = readCharacterGuid(params);
    if (guid === null || seen.has(guid)) continue;
    seen.add(guid);
    guids.push(guid);
  }
  return guids;
}

/** 批量取角色名;游戏库不可达 → 降级为空映射(列表仍展示角色 guid) */
async function loadCharacterNamesByGuids(guids: number[]): Promise<Map<number, string>> {
  try {
    return await listCharacterNamesByGuids(guids);
  } catch (err) {
    console.error("[orders/admin] 角色名加载失败,降级为只显示角色 guid", err);
    return new Map();
  }
}

/** 订单详情页 DTO:BigInt/日期在 service 序列化,页面不做 ORM 适配(issue #78) */
export type AdminOrderDetail = {
  id: string;
  orderNo: string;
  status: string;
  pointCost: number;
  createdAt: string;
  legacyWpOrderId: number | null;
  user: { id: string; username: string; nickname: string | null; email: string };
  items: {
    id: string;
    name: string;
    sku: string;
    unitPrice: number;
    qty: number;
    deliveryStatus: string;
    productSlug: string;
  }[];
};

export async function getAdminOrderDetail(id: bigint): Promise<AdminOrderDetail | null> {
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, username: true, nickname: true, email: true } },
      items: { include: { product: { select: { slug: true } } } },
    },
  });
  if (!order) return null;
  return {
    id: order.id.toString(),
    orderNo: order.orderNo,
    status: order.status,
    pointCost: order.pointCost,
    createdAt: order.createdAt.toISOString(),
    legacyWpOrderId: order.legacyWpOrderId,
    user: {
      id: order.user.id.toString(),
      username: order.user.username,
      nickname: order.user.nickname,
      email: order.user.email,
    },
    items: order.items.map((item) => ({
      id: item.id.toString(),
      name: item.name,
      sku: item.sku,
      unitPrice: item.unitPrice,
      qty: item.qty,
      deliveryStatus: item.deliveryStatus,
      productSlug: item.product.slug,
    })),
  };
}

/** 仪表盘最新订单(只读,limit 1-20) */
export async function getRecentOrders(limit = 8) {
  const take = Math.min(Math.max(limit, 1), 20);
  const rows = await prisma.order.findMany({
    orderBy: { id: "desc" },
    take,
    select: {
      id: true,
      orderNo: true,
      status: true,
      pointCost: true,
      createdAt: true,
      user: { select: { username: true, nickname: true } },
      _count: { select: { items: true } },
    },
  });
  return rows.map((o) => ({
    id: o.id.toString(),
    orderNo: o.orderNo,
    username: o.user.username,
    nickname: o.user.nickname,
    status: o.status as OrderStatusValue,
    pointCost: o.pointCost,
    itemCount: o._count.items,
    createdAt: o.createdAt.toISOString(),
  }));
}

/** D3 复核清单(api-admin 契约;T062):resolved=0 待复核(默认)/1 已落定/all 全部 */
export async function listMigrationReviews(opts: {
  resolved?: "0" | "1" | "all";
  page?: number;
}): Promise<{
  items: {
    id: string;
    legacyWpOrderId: number;
    reason: string;
    detail: unknown;
    resolvedAt: string | null;
    orderNo: string | null;
    username: string | null;
    nickname: string | null;
    orderStatus: string | null;
    pointCost: number | null;
  }[];
  page: number;
  totalPages: number;
  total: number;
}> {
  const page = Number.isInteger(opts.page) && opts.page! > 0 ? opts.page! : 1;
  const resolved =
    opts.resolved === "1" ? true : opts.resolved === "all" ? undefined : false;
  const where = resolved === undefined ? {} : { resolvedAt: resolved ? { not: null } : null };
  const { skip, take } = pageSlice(page, ADMIN_ORDER_PAGE_SIZE);
  const [total, rows] = await Promise.all([
    prisma.migrationReviewItem.count({ where }),
    prisma.migrationReviewItem.findMany({
      where,
      orderBy: { id: "asc" },
      skip,
      take,
      select: {
        id: true,
        legacyWpOrderId: true,
        reason: true,
        detail: true,
        resolvedAt: true,
      },
    }),
  ]);
  // 存量单可能已被脚本外途径清理:order 缺行时列表仍展示(review 行为真相源)
  const orderRows = await prisma.order.findMany({
    where: { legacyWpOrderId: { in: rows.map((r) => r.legacyWpOrderId) } },
    select: {
      legacyWpOrderId: true,
      orderNo: true,
      status: true,
      pointCost: true,
      user: { select: { username: true, nickname: true } },
    },
  });
  const orderMap = new Map(orderRows.map((o) => [o.legacyWpOrderId, o]));
  return {
    page,
    totalPages: totalPageCount(total, ADMIN_ORDER_PAGE_SIZE),
    total,
    items: rows.map((r) => {
      const o = orderMap.get(r.legacyWpOrderId);
      return {
        id: r.id.toString(),
        legacyWpOrderId: r.legacyWpOrderId,
        reason: r.reason,
        detail: r.detail,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        orderNo: o?.orderNo ?? null,
        username: o?.user.username ?? null,
        nickname: o?.user.nickname ?? null,
        orderStatus: o?.status ?? null,
        pointCost: o ? o.pointCost : null,
      };
    }),
  };
}
