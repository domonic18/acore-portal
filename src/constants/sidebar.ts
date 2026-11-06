import { TUTORIAL_ANCHORS, type SitePageType, type SidebarComponentKey } from "./content";

/**
 * 侧栏快捷卡常量(M4 通用化):卡片=标题+页面范围+正文+有序链接,
 * 数据存 sidebar_card/sidebar_link 表,后台 /admin/sidebar 增删改排序。
 * 默认卡等价旧 download.* 配置(客户端/补丁/登录器/插件/YY)。
 */

export type SidebarLinkConfig = {
  label: string;
  href: string;
  note?: string;
};

export type SidebarCardConfig = {
  key: string;
  title: string;
  pages: SitePageType[];
  body?: string;
  links: SidebarLinkConfig[];
};

export const SIDEBAR_LIMITS = {
  cards: 12,
  linksPerCard: 8,
  key: 64,
  title: 24,
  label: 24,
  note: 32,
  body: 60,
  href: 500,
} as const;

export const SIDEBAR_PAGE_LABELS: Record<SitePageType, string> = {
  home: "首页",
  archive: "内容归档",
  article: "文章详情",
  page: "静态页",
  progression: "渐进计划",
  forum: "论坛",
  shop: "商城",
};

/** 内置组件后台展示元数据(键→名称/说明;清单本身来自代码注册表,不可后台增删) */
export const SIDEBAR_COMPONENT_META: Record<
  SidebarComponentKey,
  { label: string; description: string }
> = {
  "server-status": { label: "在线人数", description: "服务器在线/联盟部落分布" },
  "latest-news": { label: "最新资讯", description: "资讯分类最新 5 篇" },
  "qq-group": { label: "QQ 交流群", description: "群号直达加群链接+复制/扫码(系统设置维护)" },
};

/** 最新资讯卡条目(server-status/latest-news 注册表组件与取数服务共用) */
export type SidebarNewsItem = { slug: string; title: string; publishedAt: Date | null };

export const DEFAULT_SIDEBAR_CARDS: readonly SidebarCardConfig[] = [
  {
    key: "client",
    title: "客户端下载",
    pages: ["page"],
    links: [
      {
        label: "客户端下载",
        href: `/tutorial#${TUTORIAL_ANCHORS.client}`,
        note: "1.12 完整客户端",
      },
    ],
  },
  {
    key: "patch",
    title: "补丁下载",
    pages: ["page"],
    links: [
      {
        label: "补丁下载",
        href: `/tutorial#${TUTORIAL_ANCHORS.patch}`,
        note: "patch-zhCN-5.MPQ",
      },
    ],
  },
  {
    key: "launcher",
    title: "登录器下载",
    pages: ["page"],
    links: [
      {
        label: "登录器下载",
        href: `/tutorial#${TUTORIAL_ANCHORS.launcher}`,
        note: "一键登录",
      },
    ],
  },
  {
    key: "addon",
    title: "插件下载",
    pages: ["page"],
    links: [{ label: "插件下载", href: "/post/插件下载使用方法", note: "整合包" }],
  },
  {
    key: "yy",
    title: "YY 频道",
    pages: ["page"],
    body: "频道号见公告",
    links: [],
  },
] as const;
