/**
 * 全站主导航(2026-10 与 ardot 设计稿 p01-s3 对齐,原站 GuestMenu/LoginMenu 结构):
 * 游客=首页/公告▾/数据库▾/论坛/资讯;登录态追加 积分商店▾(购物车/结账)+我的账户(FR-201)。
 * 项目简介/使用教程经首页快捷入口与页脚可达(设计稿口径,不再占顶级导航)。
 * 工具页 M4 US1 接线(封号记录/英雄榜/在线玩家/在线地图/DKP查询,契约 tools-and-seo);
 * 在线查询不进导航(旧站口径直达+301 可达)。
 */
export type SiteNavItem = {
  label: string;
  href?: string;
  authOnly?: boolean;
  children?: readonly { label: string; href: string }[];
};

export const SITE_NAV: readonly SiteNavItem[] = [
  { label: "首页", href: "/" },
  {
    label: "公告",
    href: "/announcements",
    children: [
      { label: "开发日志", href: "/devlog" },
      { label: "渐进计划", href: "/progression" },
      { label: "封号记录", href: "/banlist" },
    ],
  },
  {
    label: "数据库",
    children: [
      { label: "英雄榜", href: "/hardcore" },
      { label: "在线玩家", href: "/online-players" },
      { label: "在线地图", href: "/playermap" },
      { label: "DKP查询", href: "/dkp" },
    ],
  },
  { label: "论坛", href: "/forum" },
  { label: "资讯", href: "/news" },
  {
    label: "积分商店",
    href: "/shop",
    authOnly: true,
    children: [
      { label: "购物车", href: "/cart" },
      { label: "结账", href: "/checkout" },
    ],
  },
  { label: "我的账户", href: "/account/overview", authOnly: true },
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
  // M4 后台论坛管理(US 论坛管理页)
  { href: "/admin/forum", label: "论坛管理" },
  { href: "/admin/invitation-codes", label: "邀请码" },
  // M3 US4 内容域(T032)
  { href: "/admin/articles", label: "文章" },
  { href: "/admin/pages", label: "静态页" },
  { href: "/admin/media", label: "媒体库" },
  // M3 渐进计划节点 CRUD(T048 契约补全;T032 遗留的第 5 域)
  { href: "/admin/progression", label: "渐进计划" },
  // 首页配置(轮播物料+最近成就嵌入)
  { href: "/admin/home", label: "首页配置" },
  // M3 US6 状态人工三键(T045)
  { href: "/admin/server-status", label: "状态配置" },
  // M4 US4 统计看板(T027)
  { href: "/admin/stats", label: "看板" },
  // M4 US5 系统设置(T032)
  { href: "/admin/settings", label: "设置" },
] as const;
