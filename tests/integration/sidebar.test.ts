import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/business";
import { AUDIT_ACTION } from "@/constants/audit";
import { SIDEBAR_COMPONENT_KEYS } from "@/constants/content";
import type { SidebarCardConfig } from "@/constants/sidebar";
import {
  enabledSidebarComponents,
  listAllSidebarCards,
  listSidebarCards,
  listSidebarComponentPages,
} from "@/server/services/sidebar/query";
import { saveSidebarData } from "@/server/services/sidebar/save";

/**
 * M4 侧栏服务集成:list 过滤/排序/pages 解析 + save 整树重建(卡+内置组件页面范围)/
 * 校验零写入/审计。sidebar_card/sidebar_link/sidebar_component 为全局共享数据:
 * 用前快照、用后还原(settings 先例)。
 */

const ADMIN_ID = 3n;

type CardSnapshot = {
  key: string;
  title: string;
  pages: string[];
  body: string | null;
  sort: number;
  links: { label: string; href: string; note: string | null; sort: number }[];
};

let backup: CardSnapshot[] = [];
let componentBackup: { key: string; pages: unknown }[] = [];

async function snapshot(): Promise<CardSnapshot[]> {
  const rows = await prisma.sidebarCard.findMany({
    include: { links: { orderBy: { sort: "asc" } } },
    orderBy: { sort: "asc" },
  });
  return rows.map((row) => ({
    key: row.key,
    title: row.title,
    pages: row.pages as string[],
    body: row.body,
    sort: row.sort,
    links: row.links.map((link) => ({
      label: link.label,
      href: link.href,
      note: link.note,
      sort: link.sort,
    })),
  }));
}

async function restore(cards: CardSnapshot[]) {
  await prisma.sidebarLink.deleteMany();
  await prisma.sidebarCard.deleteMany();
  for (const card of cards) {
    await prisma.sidebarCard.create({
      data: {
        key: card.key,
        title: card.title,
        pages: card.pages,
        body: card.body,
        sort: card.sort,
        links: { create: card.links },
      },
    });
  }
}

async function seedCard(input: {
  key: string;
  title: string;
  pages: unknown;
  sort: number;
  body?: string | null;
}) {
  await prisma.sidebarCard.create({
    data: {
      key: input.key,
      title: input.title,
      pages: input.pages as string[],
      body: input.body ?? null,
      sort: input.sort,
      links: {
        create: [{ label: `${input.title}链接`, href: `/${input.key}`, sort: 0 }],
      },
    },
  });
}

const validCards: SidebarCardConfig[] = [
  {
    key: "card-b",
    title: "B 卡",
    pages: ["home", "article"],
    body: "B 卡正文",
    links: [
      { label: "B1", href: "/b-1", note: "备注一" },
      { label: "B2", href: "https://example.com/b2" },
    ],
  },
  {
    key: "card-a",
    title: "A 卡",
    pages: ["page"],
    links: [{ label: "A1", href: "/tutorial#patch_download" }],
  },
];

async function latestAudit(action: string) {
  return prisma.auditLog.findFirst({
    where: { action, actorUserId: ADMIN_ID },
    orderBy: { id: "desc" },
  });
}

beforeAll(async () => {
  backup = await snapshot();
  componentBackup = await prisma.sidebarComponent.findMany({
    select: { key: true, pages: true },
  });
});

beforeEach(async () => {
  await prisma.sidebarLink.deleteMany();
  await prisma.sidebarCard.deleteMany();
  await prisma.sidebarComponent.deleteMany();
});

afterAll(async () => {
  await restore(backup);
  await prisma.sidebarComponent.deleteMany();
  if (componentBackup.length > 0) {
    await prisma.sidebarComponent.createMany({
      data: componentBackup as { key: string; pages: string[] }[],
    });
  }
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.SIDEBAR_CHANGED, actorUserId: ADMIN_ID },
  });
  await prisma.$disconnect();
});

/** 一次性覆盖注册表全部键的合法组件提交(pages 全空=全站隐藏的合法形态) */
const allComponents = SIDEBAR_COMPONENT_KEYS.map((key) => ({ key, pages: [] as const }));

describe("listSidebarCards", () => {
  it("按 sort 排序;pages 解析后按页面类型过滤;脏 pages 回退空数组", async () => {
    await seedCard({ key: "second", title: "第二", pages: ["page"], sort: 2 });
    await seedCard({ key: "first", title: "第一", pages: ["home", "page"], sort: 1 });
    await seedCard({ key: "broken", title: "脏数据", pages: ["nope"], sort: 3 });

    const all = await listAllSidebarCards();
    expect(all.map((card) => card.key)).toEqual(["first", "second", "broken"]);
    expect(all[2]!.pages).toEqual([]);

    const pageCards = await listSidebarCards("page");
    expect(pageCards.map((card) => card.key)).toEqual(["first", "second"]);

    const homeCards = await listSidebarCards("home");
    expect(homeCards.map((card) => card.key)).toEqual(["first"]);
  });
});

describe("saveSidebarData(整树=卡+内置组件)", () => {
  it("合法整树:按数组顺序重建卡片与链接,热读取一致,审计只记 key", async () => {
    const result = await saveSidebarData(validCards, allComponents, { id: ADMIN_ID });
    expect(result).toEqual({ ok: true });

    const cards = await listAllSidebarCards();
    expect(cards).toEqual(validCards);

    const homeCards = await listSidebarCards("home");
    expect(homeCards.map((card) => card.key)).toEqual(["card-b"]);

    const audit = await latestAudit(AUDIT_ACTION.SIDEBAR_CHANGED);
    expect(audit).not.toBeNull();
    expect(audit!.payloadJson).toEqual({
      cards: ["card-b", "card-a"],
      components: [...SIDEBAR_COMPONENT_KEYS],
    });
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("B 卡");
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("/b-1");
  });

  it("整树覆盖:再次保存只保留新提交的卡片", async () => {
    await saveSidebarData(validCards, allComponents, { id: ADMIN_ID });
    await saveSidebarData(
      [{ key: "only", title: "唯一卡", pages: ["forum"], links: [{ label: "论坛", href: "/forum" }] }],
      allComponents,
      { id: ADMIN_ID },
    );
    expect((await listAllSidebarCards()).map((card) => card.key)).toEqual(["only"]);
  });

  it.each([
    [
      "重复 key",
      [
        { ...validCards[1], key: "dup" },
        { ...validCards[1], key: "dup" },
      ],
    ],
    ["空标题", [{ ...validCards[1], title: "   " }]],
    ["非法链接", [{ ...validCards[1], links: [{ label: "x", href: "javascript:alert(1)" }] }]],
    ["pages 非法值", [{ ...validCards[1], pages: ["nope" as never] }]],
    ["pages 为空", [{ ...validCards[1], pages: [] }]],
    ["无链接无正文", [{ key: "empty", title: "空卡", pages: ["page"], links: [] }]],
  ])("%s → 422 语义且零写入", async (_name, cards) => {
    await seedCard({ key: "kept", title: "保留", pages: ["page"], sort: 0 });
    const before = await prisma.sidebarCard.count();

    const result = await saveSidebarData(cards, allComponents, { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });

    expect(await prisma.sidebarCard.count()).toBe(before);
    expect((await listAllSidebarCards()).map((card) => card.key)).toEqual(["kept"]);
  });

  it("超过 12 张卡片 → 422 语义且零写入", async () => {
    const cards = Array.from({ length: 13 }, (_, i) => ({
      key: `card-${i}`,
      title: `卡 ${i}`,
      pages: ["page"] as const,
      links: [{ label: `L${i}`, href: `/l-${i}` }],
    }));
    const result = await saveSidebarData([...cards], allComponents, { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(await prisma.sidebarCard.count()).toBe(0);
  });
});

describe("内置组件页面范围(2026-11-05 后台可配)", () => {
  it("行缺失 → 代码缺省兜底;enabledSidebarComponents 按注册表顺序过滤", async () => {
    const pages = await listSidebarComponentPages();
    expect(pages["server-status"]).toEqual(["article"]);
    expect(pages["latest-news"]).toEqual(["article"]);
    expect(pages["qq-group"]).toEqual(["home", "article", "page"]);
    expect(await enabledSidebarComponents("article")).toEqual([
      "server-status",
      "latest-news",
      "qq-group",
    ]);
    expect(await enabledSidebarComponents("forum")).toEqual([]);
  });

  it("保存页面范围(含空=全站隐藏)落库;脏数据行回退缺省", async () => {
    const result = await saveSidebarData(
      [],
      [
        { key: "server-status", pages: ["home"] },
        { key: "latest-news", pages: [] },
        { key: "qq-group", pages: ["home", "page"] },
      ],
      { id: ADMIN_ID },
    );
    expect(result).toEqual({ ok: true });
    expect(await enabledSidebarComponents("home")).toEqual(["server-status", "qq-group"]);
    expect(await enabledSidebarComponents("article")).toEqual([]);

    await prisma.sidebarComponent.update({
      where: { key: "qq-group" },
      data: { pages: ["nope"] },
    });
    const pages = await listSidebarComponentPages();
    expect(pages["qq-group"]).toEqual(["home", "article", "page"]);
  });

  it.each([
    ["缺组件", allComponents.slice(0, 2)],
    [
      "重复组件",
      [...allComponents, { key: "qq-group", pages: [] }],
    ],
    [
      "未注册键",
      [...allComponents, { key: "bogus", pages: [] }],
    ],
    [
      "pages 非法值",
      allComponents.map((c) =>
        c.key === "qq-group" ? { ...c, pages: ["nope"] } : c,
      ),
    ],
  ])("%s → 422 语义且零写入", async (_name, components) => {
    await saveSidebarData([], allComponents, { id: ADMIN_ID });
    const result = await saveSidebarData([], components, { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    // 零写入:此前落库的全空范围保持不变
    expect(await enabledSidebarComponents("article")).toEqual([]);
  });
});
