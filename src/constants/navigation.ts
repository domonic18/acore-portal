/**
 * 全站主导航(2026-10-29 对齐生产原站菜单结构,ardot p01-s3 为视觉基线):
 * 游客=首页▾/公告▾/数据库▾/资讯/论坛;登录态追加 积分商店▾(购物车/结账)+我的账户▾(用户中心各页)。
 * 首页▾ 复刻原站二级菜单(项目简介/使用教程/客户端下载/登录器下载/补丁下载;
 * 后三项沿用旧站锚点直达教程页对应下载区,见 TUTORIAL_ANCHORS)。
 * 工具页 M4 US1 接线(封号记录/英雄榜/在线玩家/在线地图/DKP查询,契约 tools-and-seo);
 * 在线查询不进导航(旧站口径直达+301 可达)。
 */
import { TUTORIAL_ANCHORS } from "./content";

export type SiteNavItem = {
  label: string;
  href?: string;
  authOnly?: boolean;
  children?: readonly { label: string; href: string }[];
};

/**
 * 用户中心导航(2026-11-05 收敛:通知改页头铃铛提醒、物品恢复归商店服务、
 * 收货地址暂下线;SC-007 各页仍直达可达;同时作为「我的账户」二级菜单)
 */
export const ACCOUNT_NAV = [
  { href: "/account/overview", label: "总览" },
  { href: "/account/characters", label: "我的角色" },
  { href: "/account/points", label: "积分" },
  { href: "/account/orders", label: "订单" },
  { href: "/account/raf", label: "RAF 招募" },
  { href: "/account/settings", label: "账户设置" },
] as const;

export const SITE_NAV: readonly SiteNavItem[] = [
  {
    label: "首页",
    href: "/",
    children: [
      { label: "项目简介", href: "/about" },
      { label: "使用教程", href: "/tutorial" },
      { label: "客户端下载", href: `/tutorial#${TUTORIAL_ANCHORS.client}` },
      { label: "登录器下载", href: `/tutorial#${TUTORIAL_ANCHORS.launcher}` },
      { label: "补丁下载", href: `/tutorial#${TUTORIAL_ANCHORS.patch}` },
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
 * icon 为 lucide 图标 key,组件映射在 components/admin/admin-shell.tsx 的
 * NAV_ICONS(constants 层不引组件);未知 key 回退不渲染。
 * 设计稿另有「来源与搜索/内容与异常/智能客服」,对应功能未落地,不渲染死链。
 */
export const ADMIN_NAV_GROUPS = [
  {
    label: "运营",
    items: [
      { href: "/admin", label: "仪表盘", icon: "gauge" },
      { href: "/admin/products", label: "商品", icon: "package" },
      { href: "/admin/categories", label: "分类", icon: "folder" },
      { href: "/admin/orders", label: "订单", icon: "receipt" },
      { href: "/admin/invitation-codes", label: "邀请码", icon: "ticket" },
    ],
  },
  {
    label: "社区",
    items: [
      { href: "/admin/articles", label: "文章", icon: "newspaper" },
      { href: "/admin/pages", label: "静态页", icon: "file-text" },
      { href: "/admin/media", label: "媒体库", icon: "image" },
      { href: "/admin/progression", label: "渐进计划", icon: "trending-up" },
      { href: "/admin/home", label: "首页配置", icon: "home" },
      { href: "/admin/forum", label: "论坛管理", icon: "messages-square" },
    ],
  },
  {
    label: "数据",
    items: [
      { href: "/admin/stats", label: "看板", icon: "bar-chart" },
      { href: "/admin/review-items", label: "迁移复核", icon: "clipboard-check" },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/admin/users", label: "用户", icon: "users" },
      { href: "/admin/server-status", label: "状态配置", icon: "server" },
      { href: "/admin/sidebar", label: "侧栏入口", icon: "panel-left" },
      { href: "/admin/settings", label: "设置", icon: "settings" },
    ],
  },
] as const;

type AdminNavItem = (typeof ADMIN_NAV_GROUPS)[number]["items"][number];

/** 平铺导航(总览页卡片/测试锚点沿用) */
export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (g): readonly AdminNavItem[] => g.items,
);
