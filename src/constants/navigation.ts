/** 用户中心导航(M1 八页,SC-007 全部可达) */
export const ACCOUNT_NAV = [
  { href: "/account/overview", label: "总览" },
  { href: "/account/characters", label: "我的角色" },
  { href: "/account/points", label: "积分" },
  { href: "/account/orders", label: "订单" },
  { href: "/account/item-restore", label: "物品恢复" },
  { href: "/account/raf", label: "RAF 招募" },
  { href: "/account/settings", label: "账户设置" },
  { href: "/account/address", label: "收货地址" },
] as const;

/** 运营后台导航(M2 US5 最小集;低库存/发货异常计数由布局注入,FR-128) */
export const ADMIN_NAV = [
  { href: "/admin/products", label: "商品" },
  { href: "/admin/categories", label: "分类" },
  { href: "/admin/orders", label: "订单" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/invitation-codes", label: "邀请码" },
] as const;
