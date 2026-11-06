/** 转化埋点常量(业务转化漏斗;页面访问流量见 services/stats/page-view) */
export const CONVERSION_EVENT = {
  PRODUCT_VIEW: "product_view",
  ADD_CART: "add_cart",
  ORDER: "order",
} as const;

export type ConversionEventValue =
  (typeof CONVERSION_EVENT)[keyof typeof CONVERSION_EVENT];

/** 转化事件中文标签(看板漏斗区块展示) */
export const CONVERSION_EVENT_LABEL: Record<ConversionEventValue, string> = {
  product_view: "商品浏览",
  add_cart: "加入购物车",
  order: "下单",
};
