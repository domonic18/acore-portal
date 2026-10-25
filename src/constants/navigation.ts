/**
 * 全站主导航(M3 US1,结构照搬旧站,SC-205 逐项断言):
 * 游客菜单隐藏 authOnly 节点(我的帐户▾);商店/账户入口游客点击引导登录(FR-201)。
 * m4 标记项为 M4 工具页占位(结构在、目标页 M4 交付,FR-202 结构照搬)。
 */
export type SiteNavItem = {
  label: string;
  href?: string;
  authOnly?: boolean;
  children?: readonly { label: string; href: string; m4?: boolean }[];
};

export const SITE_NAV: readonly SiteNavItem[] = [
  { label: "首页", href: "/" },
  { label: "项目简介", href: "/about" },
  { label: "使用教程", href: "/tutorial" },
  {
    label: "公告",
    href: "/announcements",
    children: [
      { label: "开发日志", href: "/devlog" },
      { label: "渐进计划", href: "/progression" },
      { label: "封号记录", href: "#", m4: true },
    ],
  },
  {
    label: "数据库",
    children: [
      { label: "英雄榜", href: "#", m4: true },
      { label: "在线玩家", href: "#", m4: true },
      { label: "在线地图", href: "#", m4: true },
      { label: "DKP查询", href: "#", m4: true },
    ],
  },
  { label: "资讯", href: "/news" },
  { label: "论坛", href: "/forum" },
  { label: "积分商店", href: "/shop" },
  {
    label: "我的帐户",
    authOnly: true,
    children: [
      { label: "购物车", href: "/cart" },
      { label: "结账", href: "/checkout" },
    ],
  },
] as const;

/** 用户中心导航(M1 八页+M4 通知,SC-007 全部可达) */
export const ACCOUNT_NAV = [
  { href: "/account/overview", label: "总览" },
  { href: "/account/characters", label: "我的角色" },
  { href: "/account/points", label: "积分" },
  { href: "/account/notifications", label: "通知" },
  { href: "/account/orders", label: "订单" },
  { href: "/account/item-restore", label: "物品恢复" },
  { href: "/account/raf", label: "RAF 招募" },
  { href: "/account/settings", label: "账户设置" },
  { href: "/account/address", label: "收货地址" },
] as const;

/** 运营后台导航(M2 US5 最小集+US6 复核;低库存/发货异常计数由布局注入,FR-128) */
export const ADMIN_NAV = [
  { href: "/admin/products", label: "商品" },
  { href: "/admin/categories", label: "分类" },
  { href: "/admin/orders", label: "订单" },
  { href: "/admin/review-items", label: "迁移复核" },
  { href: "/admin/users", label: "用户" },
  { href: "/admin/invitation-codes", label: "邀请码" },
  // M3 US4 内容域(T032)
  { href: "/admin/articles", label: "文章" },
  { href: "/admin/pages", label: "静态页" },
  { href: "/admin/media", label: "媒体库" },
  // M3 渐进计划节点 CRUD(T048 契约补全;T032 遗留的第 5 域)
  { href: "/admin/progression", label: "渐进计划" },
  // M3 US6 状态人工三键(T045)
  { href: "/admin/server-status", label: "状态配置" },
] as const;
