import { describe, expect, it } from "vitest";
import { ACCOUNT_NAV, SITE_NAV } from "@/constants/navigation";
import { RESERVED_SLUGS, ARCHIVE_SLUGS } from "@/constants/content";

/**
 * T016 前置(Phase 1 checkpoint):SC-205 多级菜单结构断言。
 * 2026-10 与生产原站对齐(GuestMenu/LoginMenu):
 * 游客=首页▾｜公告▾｜数据库▾｜资讯｜论坛;登录态追加 积分商店▾｜我的账户▾。
 */
const GUEST_LABELS = SITE_NAV.filter((n) => !n.authOnly).map((n) => n.label);
const AUTHED_LABELS = SITE_NAV.map((n) => n.label);

describe("SITE_NAV 多级菜单结构(SC-205)", () => {
  it("顶级结构与设计稿逐项一致", () => {
    expect(AUTHED_LABELS).toEqual([
      "首页",
      "公告",
      "数据库",
      "资讯",
      "论坛",
      "积分商店",
      "我的账户",
    ]);
  });

  it("游客/登录菜单集合互斥且游客菜单为登录菜单去掉 authOnly(FR-201)", () => {
    expect(GUEST_LABELS).not.toContain("我的账户");
    expect(GUEST_LABELS).not.toContain("积分商店");
    expect(AUTHED_LABELS).toContain("我的账户");
    expect(GUEST_LABELS).toEqual(
      AUTHED_LABELS.filter((l) => l !== "我的账户" && l !== "积分商店"),
    );
    // 商城/账户入口仅登录态(设计稿:商城入口出现)
    expect(SITE_NAV.filter((n) => n.authOnly).map((n) => n.label)).toEqual([
      "积分商店",
      "我的账户",
    ]);
  });

  it("首页▾/我的账户▾ 子项与生产原站一致", () => {
    const byLabel = Object.fromEntries(SITE_NAV.map((n) => [n.label, n]));
    expect(byLabel["首页"]?.children?.map((c) => c.label)).toEqual([
      "项目简介",
      "使用教程",
      "客户端下载",
      "登录器下载",
      "补丁下载",
    ]);
    expect(byLabel["首页"]?.children?.map((c) => c.href)).toEqual([
      "/about",
      "/tutorial",
      "/tutorial",
      "/tutorial",
      "/tutorial",
    ]);
    expect(byLabel["我的账户"]?.children).toEqual(ACCOUNT_NAV);
  });

  it("公告▾/数据库▾/积分商店▾ 下拉子项与旧站一致(FR-202)", () => {
    const byLabel = Object.fromEntries(SITE_NAV.map((n) => [n.label, n]));
    expect(byLabel["公告"]?.children?.map((c) => c.label)).toEqual([
      "开发日志",
      "渐进计划",
      "封号记录",
    ]);
    expect(byLabel["数据库"]?.children?.map((c) => c.label)).toEqual([
      "英雄榜",
      "在线玩家",
      "在线地图",
      "DKP查询",
    ]);
    expect(byLabel["积分商店"]?.children?.map((c) => c.label)).toEqual([
      "购物车",
      "结账",
    ]);
    // M4 US1 工具页接线:数据库▾ 四项+封号记录均指向真路由
    expect(byLabel["数据库"]?.children?.map((c) => c.href)).toEqual([
      "/hardcore",
      "/online-players",
      "/playermap",
      "/dkp",
    ]);
    expect(
      byLabel["公告"]?.children?.find((c) => c.label === "封号记录")?.href,
    ).toBe("/banlist");
  });

  it("核心路由项指向真路由,保留字清单不含核心内容页 slug", () => {
    const byLabel = Object.fromEntries(SITE_NAV.map((n) => [n.label, n]));
    expect(byLabel["首页"]?.href).toBe("/");
    expect(byLabel["公告"]?.href).toBe("/announcements");
    expect(byLabel["资讯"]?.href).toBe("/news");
    expect(byLabel["论坛"]?.href).toBe("/forum");
    expect(byLabel["积分商店"]?.href).toBe("/shop");
    expect(byLabel["我的账户"]?.href).toBe("/account/overview");
    // RESERVED_SLUGS 是代码持有段,不得覆盖核心内容页 about/tutorial/...
    for (const core of ["about", "tutorial", "agreement", "convention", "sitemap"]) {
      expect(RESERVED_SLUGS).not.toContain(core);
    }
    expect(ARCHIVE_SLUGS).toEqual([
      "announcements",
      "news",
      "guides",
      "devlog",
    ]);
  });
});
