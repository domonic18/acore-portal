/** 商城域常量(data-model §1.3;SKU 前缀为宪法 I 铁律③映射契约的一部分) */

export const PRODUCT_TYPE = {
  GAME_ITEM: "game_item",
  SERVICE: "service",
} as const;

export type ProductTypeValue = (typeof PRODUCT_TYPE)[keyof typeof PRODUCT_TYPE];

export const PRODUCT_STATUS = {
  DRAFT: "draft",
  PUBLISHED: "published",
} as const;

export type ProductStatusValue = (typeof PRODUCT_STATUS)[keyof typeof PRODUCT_STATUS];

/** 订单状态机 7 态(data-model §3;delivering=短瞬态,completed/cancelled/refunded=终态) */
export const ORDER_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  DELIVERING: "delivering",
  COMPLETED: "completed",
  DELIVERY_FAILED: "delivery_failed",
  CANCELLED: "cancelled",
  REFUNDED: "refunded",
} as const;

export type OrderStatusValue = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export const ORDER_ITEM_DELIVERY_STATUS = {
  PENDING: "pending",
  DELIVERED: "delivered",
  FAILED: "failed",
} as const;

export type OrderItemDeliveryStatusValue =
  (typeof ORDER_ITEM_DELIVERY_STATUS)[keyof typeof ORDER_ITEM_DELIVERY_STATUS];

/** 物品类 SKU 前缀:`itemsend_{游戏物品ID}`(宪法 I 铁律③;前缀路由到 ItemSendHandler) */
export const ITEMSEND_SKU_PREFIX = "itemsend_";

/** 列表分页大小(contracts/api-shop) */
export const SHOP_PAGE_SIZE = 24;

/** 列表排序(contracts/api-shop;price_* 按生效价排) */
export const PRODUCT_SORT = {
  PRICE_ASC: "price_asc",
  PRICE_DESC: "price_desc",
  NEWEST: "newest",
} as const;

export type ProductSortValue = (typeof PRODUCT_SORT)[keyof typeof PRODUCT_SORT];

/** 订单号前缀:orderNo = M2{YYYYMMDD}{6位序列}(data-model §2.4) */
export const ORDER_NO_PREFIX = "M2";

/** 订单状态中文标签(FR-117 列表/详情可见性) */
export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  [ORDER_STATUS.PENDING]: "待支付",
  [ORDER_STATUS.PAID]: "已支付",
  [ORDER_STATUS.DELIVERING]: "发货中",
  [ORDER_STATUS.COMPLETED]: "已完成",
  [ORDER_STATUS.DELIVERY_FAILED]: "发货异常",
  [ORDER_STATUS.CANCELLED]: "已取消",
  [ORDER_STATUS.REFUNDED]: "已退款",
};

/** 行级发货状态中文标签 */
export const DELIVERY_STATUS_LABEL: Record<OrderItemDeliveryStatusValue, string> = {
  [ORDER_ITEM_DELIVERY_STATUS.PENDING]: "待发货",
  [ORDER_ITEM_DELIVERY_STATUS.DELIVERED]: "已发货",
  [ORDER_ITEM_DELIVERY_STATUS.FAILED]: "发货失败",
};

/** 低库存默认阈值(存量坐骑阈值=1,后台可按商品覆盖) */
export const DEFAULT_LOW_STOCK_THRESHOLD = 1;
