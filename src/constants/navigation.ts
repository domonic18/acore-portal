/**
 * 全站主导航(2026-10-29 对齐生产原站菜单结构,ardot p01-s3 为视觉基线):
 * 游客=首页▾/公告▾/数据库▾/资讯/论坛;登录态追加 积分商店▾(购物车/结账)+我的账户▾(用户中心各页)。
 * 首页▾ 复刻原站二级菜单(项目简介/使用教程/客户端下载/登录器下载/补丁下载,均落站内真实路由)。
 * 工具页 M4 US1 接线(封号记录/英雄榜/在线玩家/在线地图/DKP查询,契约 tools-and-seo);
 * 在线查询不进导航(旧站口径直达+301 可达)。
 */
export type SiteNavItem = {
  label: string;
  href?: string;
  authOnly?: boolean;
  children?: readonly { label: string; href: string }[];
};

/** 用户中心导航(M1 八页+M4 通知,SC-007 全部可达;同时作为「我的账户」二级菜单) */
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

export const SITE_NAV: readonly SiteNavItem[] = [
  {
    label: "首页",
    href: "/",
    children: [
      { label: "项目简介", href: "/about" },
      { label: "使用教程", href: "/tutorial" },
      { label: "客户端下载", href: "/tutorial" },
      { label: "登录器下载", href: "/tutorial" },
      { label: "补丁下载", href: "/tutorial" },
    ],
  },
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
  { label: "资讯", href: "/news" },
  { label: "论坛", href: "/forum" },
  {
    label: "积分商店",
    href: "/shop",
    authOnly: true,
    children: [
      { label: "购物车", href: "/cart" },
      { label: "结账", href: "/checkout" },
    ],
  },
  {
    label: "我的账户",
    href: "/account/overview",
    authOnly: true,
    children: ACCOUNT_NAV,
  },
] as const;

/**
 * 运营后台导航分组(ardot p12 后台外壳:运营/社区/数据/系统)。
 * 设计稿另有「来源与搜索/内容与异常/智能客服」,对应功能未落地,不渲染死链。
 */
export const ADMIN_NAV_GROUPS = [
  {
    label: "运营",
    items: [
      { href: "/admin", label: "仪表盘" },
      { href: "/admin/products", label: "商品" },
      { href: "/admin/categories", label: "分类" },
      { href: "/admin/orders", label: "订单" },
      { href: "/admin/invitation-codes", label: "邀请码" },
    ],
  },
  {
    label: "社区",
    items: [
      { href: "/admin/articles", label: "文章" },
      { href: "/admin/pages", label: "静态页" },
      { href: "/admin/media", label: "媒体库" },
      { href: "/admin/progression", label: "渐进计划" },
      { href: "/admin/home", label: "首页配置" },
      { href: "/admin/forum", label: "论坛管理" },
    ],
  },
  {
    label: "数据",
    items: [
      { href: "/admin/stats", label: "看板" },
      { href: "/admin/review-items", label: "迁移复核" },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/admin/users", label: "用户" },
      { href: "/admin/server-status", label: "状态配置" },
      { href: "/admin/settings", label: "设置" },
    ],
  },
] as const;

type AdminNavItem = (typeof ADMIN_NAV_GROUPS)[number]["items"][number];

/** 平铺导航(总览页卡片/测试锚点沿用) */
export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (g): readonly AdminNavItem[] => g.items,
);
