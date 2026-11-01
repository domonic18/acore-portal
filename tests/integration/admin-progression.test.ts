import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { SESSION } from "@/constants/session";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { createSession, revokeAllSessions, revokeAllRefreshTokens } from "@/lib/auth/session";
import {
  deleteProgressionNode,
  listAdminProgression,
  saveProgressionNode,
  saveProgressionTimeline,
} from "@/server/services/progression/progression";
import { ContentAdminError } from "@/server/services/content/admin";
// 越权回归直接打路由处理器(M2 admin-guard 同源守卫)
import { POST as progressionPost } from "@/app/api/admin/progression/route";

/**
 * T048 契约补全:渐进计划后台 CRUD(api-admin-m3 合同 §渐进计划;T032 遗留面):
 * 全量列表 sort+date+isCurrent/新建/更新/删除(删指针节点同时清 progression.current_node_id,
 * 审计注明 pointerCleared)/越权 401/403+admin_access_violation。
 * 指针行用后还原(dev 库存量指针可能已被 status-config 设置)。
 */
const RUN = Date.now().toString(36);
const TITLE_PREFIX = `T52 节点 ${RUN}`;
const POINTER_KEY = "progression.current_node_id";
const guardUids = [9900011n, 9900012n]; // admin / moderator(不建 User 行,沿用 admin-guard 模式)

const createdIds: bigint[] = [];
let priorPointer: string | null = null; // dev 库指针行快照,afterAll 还原
let priorSorts: { id: bigint; sort: number }[] = []; // 整树保存会重排 sort,afterAll 还原存量行

async function errCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ContentAdminError) return err.code;
    throw err;
  }
  throw new Error("expected ContentAdminError");
}

async function lastAudit(actorUserId: bigint, action: string) {
  return prisma.auditLog.findFirstOrThrow({
    where: { action, actorUserId },
    orderBy: { id: "desc" },
  });
}

async function moderatorReq(path: string, body: unknown): Promise<NextRequest> {
  const { accessToken } = await createSession(guardUids[1]!, "moderator");
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: new Headers({
      "content-type": "application/json",
      cookie: `${SESSION.ACCESS_COOKIE}=${accessToken}`,
    }),
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();
  priorPointer = (await prisma.systemConfig.findUnique({ where: { key: POINTER_KEY } }))?.value ?? null;
  priorSorts = await prisma.progressionNode.findMany({ select: { id: true, sort: true } });
});

afterAll(async () => {
  await prisma.progressionNode.deleteMany({ where: { id: { in: createdIds } } });
  for (const row of priorSorts) {
    await prisma.progressionNode.updateMany({ where: { id: row.id }, data: { sort: row.sort } });
  }
  // 指针行还原(删/改过的用例统一回到进入前状态;快照为 null 则删行)
  if (priorPointer === null) {
    await prisma.systemConfig.deleteMany({ where: { key: POINTER_KEY } });
  } else {
    await prisma.systemConfig.upsert({
      where: { key: POINTER_KEY },
      update: { value: priorPointer },
      create: { key: POINTER_KEY, value: priorPointer },
    });
  }
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { actorUserId: { in: guardUids }, action: AUDIT_ACTION.ADMIN_ACCESS_VIOLATION },
        { action: { startsWith: "content_progression_" }, category: AUDIT_CATEGORY.CONTENT },
      ],
    },
  });
  for (const uid of guardUids) {
    await revokeAllSessions(uid.toString());
    await revokeAllRefreshTokens(uid.toString());
  }
  await redis.quit();
  await prisma.$disconnect();
});

describe("渐进计划后台 CRUD(T048 补全 api-admin-m3)", () => {
  it("画布整树保存:按数组顺序重排+新增+删除+指针同步,单条脱敏审计", async () => {
    // 存量行按画布顺序原样回传(保存前快照),只让夹具发生变更
    const existing = await listAdminProgression();
    const passthrough = existing.map((n) => ({
      id: n.id,
      title: n.title,
      phaseDate: n.phaseDate,
      imageUrl: n.imageUrl,
      bodyMd: n.bodyMd,
      status: n.status as "locked" | "open",
      icon: n.icon,
    }));

    const x = await saveProgressionNode({
      title: `${TITLE_PREFIX} 画布删`, phaseDate: "2026-07-01", status: "open", sort: 90, actorUserId: guardUids[0]!,
    });
    const y = await saveProgressionNode({
      title: `${TITLE_PREFIX} 画布留`, phaseDate: "2026-07-02", status: "locked", icon: "🐉", sort: 91, actorUserId: guardUids[0]!,
    });
    const z = await saveProgressionNode({
      title: `${TITLE_PREFIX} 画布改`, phaseDate: "2026-07-03", status: "locked", sort: 92, actorUserId: guardUids[0]!,
    });
    createdIds.push(x.id, y.id, z.id);

    const result = await saveProgressionTimeline(
      {
        items: [
          ...passthrough,
          { id: z.id.toString(), title: `${TITLE_PREFIX} 画布改·新`, phaseDate: null, imageUrl: null, bodyMd: "换行\n第二行", status: "open", icon: null },
          { id: null, title: `${TITLE_PREFIX} 画布增`, phaseDate: "2026-09-01", imageUrl: null, bodyMd: null, status: "locked", icon: null },
          { id: y.id.toString(), title: `${TITLE_PREFIX} 画布留`, phaseDate: "2026-07-02", imageUrl: null, bodyMd: null, status: "locked", icon: "🐉" },
        ],
        deletedIds: [x.id.toString()],
        currentId: y.id.toString(),
      },
      guardUids[0]!,
    );

    expect(result.deleted).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBeGreaterThanOrEqual(2); // z 内容变更 + y 顺序变更
    expect(result.items).toHaveLength(passthrough.length + 3);
    const newId = result.items.at(-2)!.id;
    createdIds.push(BigInt(newId));

    await expect(prisma.progressionNode.findUnique({ where: { id: x.id } })).resolves.toBeNull();
    const listed = await listAdminProgression();
    const mine = listed.filter((n) =>
      [z.id.toString(), newId, y.id.toString()].includes(n.id),
    );
    expect(mine.map((n) => n.id)).toEqual([z.id.toString(), newId, y.id.toString()]);
    expect(mine[0]!.title).toBe(`${TITLE_PREFIX} 画布改·新`);
    expect(mine[0]!.phaseDate).toBeNull();
    expect(mine[0]!.status).toBe("open");
    expect(mine[1]!.bodyMd).toBeNull();
    expect(mine[2]!.isCurrent).toBe(true);

    const pointer = await prisma.systemConfig.findUnique({ where: { key: POINTER_KEY } });
    expect(pointer?.value).toBe(y.id.toString());

    const audit = await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_PROGRESSION_SAVED);
    const payload = audit.payloadJson as {
      created?: number; updated?: number; deleted?: number; current?: string; title?: string;
    };
    expect(payload).toMatchObject({ created: 1, deleted: 1, current: y.id.toString() });
    expect(payload.updated).toBeGreaterThanOrEqual(2);
    expect(payload.title).toBeUndefined();
  });

  it("整树保存校验:重复 id/幽灵 id/指针不在画布 → 抛错且零写入", async () => {
    const existing = await listAdminProgression();
    const sample = existing[0]!;
    const base = {
      title: sample.title, phaseDate: sample.phaseDate, imageUrl: sample.imageUrl,
      bodyMd: sample.bodyMd, status: sample.status as "locked" | "open", icon: sample.icon,
    };
    await expect(errCode(saveProgressionTimeline(
      { items: [{ id: sample.id, ...base }, { id: sample.id, ...base }], deletedIds: [], currentId: null },
      guardUids[0]!,
    ))).resolves.toBe("DUPLICATE");
    await expect(errCode(saveProgressionTimeline(
      { items: [{ id: sample.id, ...base }], deletedIds: [sample.id], currentId: null },
      guardUids[0]!,
    ))).resolves.toBe("DUPLICATE");
    await expect(errCode(saveProgressionTimeline(
      { items: [{ id: "999999999", ...base }], deletedIds: [], currentId: null },
      guardUids[0]!,
    ))).resolves.toBe("NOT_FOUND");
    await expect(errCode(saveProgressionTimeline(
      { items: [{ id: null, ...base }], deletedIds: [], currentId: "999999999" },
      guardUids[0]!,
    ))).resolves.toBe("NOT_FOUND");

    const after = await listAdminProgression();
    expect(after.map((n) => n.id)).toEqual(existing.map((n) => n.id));
  });

  it("新建→更新→列表含 isCurrent→全字段落库(含 icon);保存审计只记 id/status/sort", async () => {
    const created = await saveProgressionNode({
      title: `${TITLE_PREFIX} 一`,
      phaseDate: "2026-03-01",
      imageUrl: null,
      bodyMd: "第一阶段说明",
      status: "open",
      icon: "⚔️",
      sort: 5,
      actorUserId: guardUids[0]!,
    });
    createdIds.push(created.id);

    const updated = await saveProgressionNode({
      id: created.id,
      title: `${TITLE_PREFIX} 一改`,
      phaseDate: null, // 未定档
      imageUrl: "https://cdn.example.com/p1.jpg",
      bodyMd: null,
      status: "locked",
      icon: null, // 清空图标=前台默认圆点
      sort: 6,
      actorUserId: guardUids[0]!,
    });
    expect(updated.id).toBe(created.id);

    const row = await prisma.progressionNode.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.title).toBe(`${TITLE_PREFIX} 一改`);
    expect(row.phaseDate).toBeNull();
    expect(row.imageUrl).toBe("https://cdn.example.com/p1.jpg");
    expect(row.bodyMd).toBeNull();
    expect(row.status).toBe("locked");
    expect(row.icon).toBeNull();
    expect(row.sort).toBe(6);

    const audit = await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_PROGRESSION_SAVED);
    expect(audit.category).toBe(AUDIT_CATEGORY.CONTENT);
    const payload = audit.payloadJson as { id?: string; title?: string; bodyMd?: string };
    expect(payload.id).toBe(created.id.toString());
    expect(payload.title).toBeUndefined(); // 脱敏:不记标题/正文
    expect(payload.bodyMd).toBeUndefined();

    await expect(errCode(saveProgressionNode({
      id: 999999999n,
      title: `${TITLE_PREFIX} 幽灵`,
      phaseDate: null,
      status: "open",
      sort: 0,
      actorUserId: guardUids[0]!,
    }))).resolves.toBe("NOT_FOUND");
  });

  it("删除非指针节点:指针保留,审计 pointerCleared=false", async () => {
    const node = await saveProgressionNode({
      title: `${TITLE_PREFIX} 二`,
      phaseDate: "2026-04-01",
      status: "locked",
      sort: 7,
      actorUserId: guardUids[0]!,
    });
    createdIds.push(node.id);

    await prisma.systemConfig.upsert({
      where: { key: POINTER_KEY },
      update: { value: "0" }, // 指向不存在节点≠本节点
      create: { key: POINTER_KEY, value: "0" },
    });
    await deleteProgressionNode(node.id, guardUids[0]!);
    await expect(prisma.progressionNode.findUnique({ where: { id: node.id } })).resolves.toBeNull();
    const audit = await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_PROGRESSION_DELETED);
    expect((audit.payloadJson as { pointerCleared?: boolean }).pointerCleared).toBe(false);
  });

  it("删除当前指针节点:指针行同清+审计注明 pointerCleared=true", async () => {
    const node = await saveProgressionNode({
      title: `${TITLE_PREFIX} 三`,
      phaseDate: "2026-05-01",
      status: "open",
      sort: 8,
      actorUserId: guardUids[0]!,
    });
    createdIds.push(node.id);

    await prisma.systemConfig.upsert({
      where: { key: POINTER_KEY },
      update: { value: node.id.toString() },
      create: { key: POINTER_KEY, value: node.id.toString() },
    });

    const listed = await listAdminProgression();
    const mine = listed.find((n) => n.id === node.id.toString());
    expect(mine?.isCurrent).toBe(true);

    await deleteProgressionNode(node.id, guardUids[0]!);
    await expect(prisma.progressionNode.findUnique({ where: { id: node.id } })).resolves.toBeNull();
    await expect(prisma.systemConfig.findUnique({ where: { key: POINTER_KEY } })).resolves.toBeNull();
    const audit = await lastAudit(guardUids[0]!, AUDIT_ACTION.CONTENT_PROGRESSION_DELETED);
    expect((audit.payloadJson as { pointerCleared?: boolean }).pointerCleared).toBe(true);
  });

  it("列表按画布 sort 优先(同序日期 NULLS LAST),isCurrent 只标指针节点", async () => {
    const a = await saveProgressionNode({
      title: `${TITLE_PREFIX} 甲`, phaseDate: "2026-06-01", status: "open", sort: 2, actorUserId: guardUids[0]!,
    });
    const b = await saveProgressionNode({
      title: `${TITLE_PREFIX} 乙`, phaseDate: "2026-06-01", status: "locked", icon: "🐉", sort: 1, actorUserId: guardUids[0]!,
    });
    const c = await saveProgressionNode({
      title: `${TITLE_PREFIX} 丙`, phaseDate: null, status: "locked", sort: 0, actorUserId: guardUids[0]!,
    });
    createdIds.push(a.id, b.id, c.id);
    await prisma.systemConfig.upsert({
      where: { key: POINTER_KEY },
      update: { value: b.id.toString() },
      create: { key: POINTER_KEY, value: b.id.toString() },
    });

    const listed = await listAdminProgression();
    const mine = listed.filter((n) => n.id === a.id.toString() || n.id === b.id.toString() || n.id === c.id.toString());
    expect(mine.map((n) => n.id)).toEqual([c.id.toString(), b.id.toString(), a.id.toString()]);
    expect(mine.find((n) => n.id === b.id.toString())?.isCurrent).toBe(true);
    expect(mine.find((n) => n.id === b.id.toString())?.icon).toBe("🐉");
    expect(mine.filter((n) => n.id !== b.id.toString()).every((n) => !n.isCurrent)).toBe(true);
    expect(mine[0]!.phaseDate).toBeNull(); // 未定档节点 sort 最小,排画布首位
  });

  it("moderator POST /api/admin/progression → 403 + admin_access_violation", async () => {
    const req = await moderatorReq("/api/admin/progression", {
      title: `${TITLE_PREFIX} 越权`, phaseDate: null, status: "open", sort: 0,
    });
    const res = await progressionPost(req);
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("FORBIDDEN");
    const audit = await lastAudit(guardUids[1]!, AUDIT_ACTION.ADMIN_ACCESS_VIOLATION);
    expect(audit.category).toBe(AUDIT_CATEGORY.SECURITY);
    expect((audit.payloadJson as { path?: string }).path).toBe("/api/admin/progression");
  });
});
