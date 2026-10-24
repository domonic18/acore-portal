import { describe, expect, it } from "vitest";
import { SITE_NAV } from "@/constants/navigation";
import { RESERVED_SLUGS, ARCHIVE_SLUGS } from "@/constants/content";

/**
 * T016 前置(Phase 1 checkpoint):SC-205 多级菜单结构断言。
 * 结构照搬旧站(spec US1):首页｜项目简介/使用教程｜公告▾｜数据库▾｜资讯｜论坛｜积分商店｜我的帐户▾。
 */
const GUEST_LABELS = SITE_NAV.filter((n) => !n.authOnly).map((n) => n.label);
const AUTHED_LABELS = SITE_NAV.map((n) => n.label);

describe("SITE_NAV 多级菜单结构(SC-205)", () => {
  it("顶级结构与旧站逐项一致", () => {
    expect(AUTHED_LABELS).toEqual([
      "首页",
      "项目简介",
      "使用教程",
      "公告",
      "数据库",
      "资讯",
      "论坛",
      "积分商店",
      "我的帐户",
    ]);
  });

  it("游客/登录菜单集合互斥且游客菜单为登录菜单去掉 authOnly(FR-201)", () => {
    expect(GUEST_LABELS).not.toContain("我的帐户");
    expect(AUTHED_LABELS).toContain("我的帐户");
    expect(GUEST_LABELS).toEqual(AUTHED_LABELS.filter((l) => l !== "我的帐户"));
    // 仅我的帐户▾ 携带 authOnly
    expect(SITE_NAV.filter((n) => n.authOnly).map((n) => n.label)).toEqual([
      "我的帐户",
    ]);
  });

  it("公告▾/数据库▾/我的帐户▾ 下拉子项与旧站一致(FR-202)", () => {
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
    expect(byLabel["我的帐户"]?.children?.map((c) => c.label)).toEqual([
      "购物车",
      "结账",
    ]);
    // M4 占位标记:数据库▾ 全部 + 封号记录
    expect(byLabel["数据库"]?.children?.every((c) => c.m4)).toBe(true);
    expect(
      byLabel["公告"]?.children?.find((c) => c.label === "封号记录")?.m4,
    ).toBe(true);
  });

  it("归档路由项指向归档 slug,保留字清单不含核心内容页 slug", () => {
    const byLabel = Object.fromEntries(SITE_NAV.map((n) => [n.label, n]));
    expect(byLabel["公告"]?.href).toBe("/announcements");
    expect(byLabel["资讯"]?.href).toBe("/news");
    expect(byLabel["论坛"]?.href).toBe("/forum");
    expect(byLabel["积分商店"]?.href).toBe("/shop");
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
