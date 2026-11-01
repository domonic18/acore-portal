import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/business";
import { AUDIT_ACTION } from "@/constants/audit";
import type { SidebarCardConfig } from "@/constants/sidebar";
import { listAllSidebarCards, listSidebarCards } from "@/server/services/sidebar/query";
import { saveSidebarCards } from "@/server/services/sidebar/save";

/**
 * M4 侧栏快捷卡服务集成:list 过滤/排序/pages 解析 + save 整树重建/校验零写入/审计。
 * sidebar_card/sidebar_link 为全局共享数据:用前快照、用后还原(settings 先例)。
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
});

beforeEach(async () => {
  await prisma.sidebarLink.deleteMany();
  await prisma.sidebarCard.deleteMany();
});

afterAll(async () => {
  await restore(backup);
  await prisma.auditLog.deleteMany({
    where: { action: AUDIT_ACTION.SIDEBAR_CHANGED, actorUserId: ADMIN_ID },
  });
  await prisma.$disconnect();
});

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

describe("saveSidebarCards", () => {
  it("合法整树:按数组顺序重建卡片与链接,热读取一致,审计只记 key", async () => {
    const result = await saveSidebarCards(validCards, { id: ADMIN_ID });
    expect(result).toEqual({ ok: true });

    const cards = await listAllSidebarCards();
    expect(cards).toEqual(validCards);

    const homeCards = await listSidebarCards("home");
    expect(homeCards.map((card) => card.key)).toEqual(["card-b"]);

    const audit = await latestAudit(AUDIT_ACTION.SIDEBAR_CHANGED);
    expect(audit).not.toBeNull();
    expect(audit!.payloadJson).toEqual({ cards: ["card-b", "card-a"] });
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("B 卡");
    expect(JSON.stringify(audit!.payloadJson)).not.toContain("/b-1");
  });

  it("整树覆盖:再次保存只保留新提交的卡片", async () => {
    await saveSidebarCards(validCards, { id: ADMIN_ID });
    await saveSidebarCards(
      [{ key: "only", title: "唯一卡", pages: ["forum"], links: [{ label: "论坛", href: "/forum" }] }],
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

    const result = await saveSidebarCards(cards, { id: ADMIN_ID });
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
    const result = await saveSidebarCards([...cards], { id: ADMIN_ID });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION_FAILED" });
    expect(await prisma.sidebarCard.count()).toBe(0);
  });
});
