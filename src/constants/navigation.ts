/**
 * 全站主导航(2026-10-29 对齐生产原站菜单结构,ardot p01-s3 为视觉基线):
 * 游客=首页▾/公告▾/数据库▾/资讯/论坛;登录态追加 积分商店▾(购物车/结账)+我的账户▾(用户中心各页)。
 * 搜索不进主导航(2026-11-18 用户反馈):入口收敛为页头右侧搜索 ICON(铃铛左侧,header-client)。
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
 * 运营后台导航分组(2026-11-18 用户反馈重组:①数据组居首(仪表盘+看板,
 * 安全看板并入看板页 Tab);②迁移复核菜单下线(页面保留可达,仅不再入菜单);
 * ③用户归运营组;④分类并入商品页 Tab;⑤静态页并入内容页 Tab;
 * ⑥积分规则并入设置页 Tab;⑦状态配置并入首页配置页 Tab)。
 * icon 为 lucide 图标 key,组件映射在 components/admin/admin-shell.tsx 的
 * NAV_ICONS(constants 层不引组件);未知 key 回退不渲染。
 * 设计稿另有「来源与搜索/内容与异常/智能客服」,对应功能未落地,不渲染死链。
 */
export const ADMIN_NAV_GROUPS = [
  {
    label: "数据",
    items: [
      { href: "/admin", label: "仪表盘", icon: "gauge" },
      { href: "/admin/stats", label: "看板", icon: "bar-chart" },
    ],
  },
  {
    label: "运营",
    items: [
      { href: "/admin/products", label: "商品", icon: "package" },
      { href: "/admin/orders", label: "订单", icon: "receipt" },
      { href: "/admin/invitation-codes", label: "邀请码", icon: "ticket" },
      { href: "/admin/users", label: "用户", icon: "users" },
    ],
  },
  {
    label: "社区",
    items: [
      { href: "/admin/articles", label: "内容", icon: "newspaper" },
      { href: "/admin/media", label: "媒体库", icon: "image" },
      { href: "/admin/progression", label: "渐进计划", icon: "trending-up" },
      { href: "/admin/home", label: "首页配置", icon: "home" },
      { href: "/admin/forum", label: "论坛管理", icon: "messages-square" },
    ],
  },
  {
    label: "系统",
    items: [
      { href: "/admin/sidebar", label: "侧栏入口", icon: "panel-left" },
      // AI 管理(2026-11-18 用户反馈:模型/用量/对话三菜单合并为单入口,页内 Tab)
      { href: "/admin/ai", label: "AI 管理", icon: "bot" },
      { href: "/admin/settings", label: "设置", icon: "settings" },
    ],
  },
] as const;

type AdminNavItem = (typeof ADMIN_NAV_GROUPS)[number]["items"][number];

/** 平铺导航(总览页卡片/测试锚点沿用) */
export const ADMIN_NAV: readonly AdminNavItem[] = ADMIN_NAV_GROUPS.flatMap(
  (g): readonly AdminNavItem[] => g.items,
);
