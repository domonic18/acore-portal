import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { PROGRESSION_CURRENT_NODE_KEY } from "@/constants/status";
import { writeAudit } from "@/server/services/shared/audit";
import { ContentAdminError } from "@/server/services/content/admin";

/**
 * 渐进计划(M3 US3 T022;R8 人工指针):
 * 时间轴按 sort(后台画布顺序)优先,phaseDate 仅作同序稳定键;当前=system_config
 * 指针 progression.current_node_id,指针缺省/指向已删节点回退时间轴末位 open。
 * 后台 CRUD(T048 契约补全 api-admin-m3):删除当前指针节点同清指针行并审计注明;
 * 审计只记 id/status/sort,不记标题/正文(T048 脱敏口径)。
 */

const POINTER_KEY = PROGRESSION_CURRENT_NODE_KEY;

/** 画布顺序即时间轴顺序(WP 区块顺序语义);日期只用于同日兜底 */
const ORDER_BY = [
  { sort: "asc" as const },
  { phaseDate: { sort: "asc" as const, nulls: "last" as const } },
  { id: "asc" as const },
];

const SELECT = {
  id: true,
  title: true,
  phaseDate: true,
  imageUrl: true,
  bodyMd: true,
  status: true,
  icon: true,
  sort: true,
} as const;

export type ProgressionNodeView = Awaited<
  ReturnType<typeof listProgressionTimeline>
>[number];

export async function listProgressionTimeline() {
  return prisma.progressionNode.findMany({ orderBy: ORDER_BY, select: SELECT });
}

/** 当前/下一阶段解析:指针优先,回退末位 open;next=时间轴后继(可为 locked) */
export async function resolveProgressionPosition(): Promise<{
  current: ProgressionNodeView | null;
  next: ProgressionNodeView | null;
}> {
  const nodes = await listProgressionTimeline();
  if (nodes.length === 0) return { current: null, next: null };

  const pointer = await prisma.systemConfig.findUnique({
    where: { key: POINTER_KEY },
    select: { value: true },
  });
  const current =
    (pointer && nodes.find((n) => String(n.id) === pointer.value)) ??
    [...nodes].reverse().find((n) => n.status === "open") ??
    null;
  if (!current) return { current: null, next: null };

  const idx = nodes.findIndex((n) => n.id === current.id);
  return { current, next: nodes[idx + 1] ?? null };
}

// ===== 后台 CRUD(T048 契约补全;契约 api-admin-m3 §渐进计划) =====

export type AdminProgressionNode = {
  id: string;
  title: string;
  phaseDate: string | null;
  imageUrl: string | null;
  bodyMd: string | null;
  status: string;
  icon: string | null;
  sort: number;
  isCurrent: boolean;
};

/** 后台全量列表(sort+date 同前台序)+ isCurrent 指针标记 */
export async function listAdminProgression(): Promise<AdminProgressionNode[]> {
  const [nodes, pointer] = await Promise.all([
    listProgressionTimeline(),
    prisma.systemConfig.findUnique({ where: { key: POINTER_KEY }, select: { value: true } }),
  ]);
  return nodes.map((n) => ({
    id: n.id.toString(),
    title: n.title,
    phaseDate: n.phaseDate?.toISOString().slice(0, 10) ?? null,
    imageUrl: n.imageUrl,
    bodyMd: n.bodyMd,
    status: n.status,
    icon: n.icon,
    sort: n.sort,
    isCurrent: pointer?.value === n.id.toString(),
  }));
}

export async function saveProgressionNode(input: {
  id?: bigint;
  title: string;
  phaseDate: string | null;
  imageUrl?: string | null;
  bodyMd?: string | null;
  status: "locked" | "open";
  icon?: string | null;
  sort: number;
  actorUserId: bigint;
}): Promise<{ id: bigint }> {
  const data = {
    title: input.title,
    phaseDate: input.phaseDate ? new Date(`${input.phaseDate}T00:00:00Z`) : null,
    imageUrl: input.imageUrl ?? null,
    bodyMd: input.bodyMd ?? null,
    status: input.status,
    icon: input.icon ?? null,
    sort: input.sort,
  };
  if (input.id) {
    const hit = await prisma.progressionNode.updateMany({ where: { id: input.id }, data });
    if (hit.count === 0) throw new ContentAdminError("NOT_FOUND", "渐进节点不存在。");
    await writeAudit({
      category: AUDIT_CATEGORY.CONTENT,
      action: AUDIT_ACTION.CONTENT_PROGRESSION_SAVED,
      actorUserId: input.actorUserId,
      payload: { id: input.id.toString(), status: input.status, sort: input.sort },
    });
    return { id: input.id };
  }
  const created = await prisma.progressionNode.create({ data, select: { id: true } });
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_PROGRESSION_SAVED,
    actorUserId: input.actorUserId,
    payload: { id: created.id.toString(), status: input.status, sort: input.sort },
  });
  return { id: created.id };
}

/** 后台画布整树保存入参:sort 由数组顺序决定,新增节点 id 为空 */
export type ProgressionTimelineSaveItem = {
  id?: string | null;
  title: string;
  phaseDate: string | null;
  imageUrl: string | null;
  bodyMd: string | null;
  status: "locked" | "open";
  icon: string | null;
};

export type ProgressionTimelineSaveResult = {
  items: { id: string }[];
  created: number;
  updated: number;
  deleted: number;
  pointerCleared: boolean;
};

/**
 * 画布整树保存(后台唯一批量写入口,WP 区块顺序语义):
 * 数组顺序即时间轴顺序(sort=index+1);删除只认显式 deletedIds(防误删未提交节点);
 * currentId 同步当前阶段指针(null=清除,回退末位 open)。先校验 id 存在/不重复,
 * 失败零写入;单条脱敏审计只记计数。
 */
export async function saveProgressionTimeline(
  input: {
    items: ProgressionTimelineSaveItem[];
    deletedIds: string[];
    currentId: string | null;
  },
  actorUserId: bigint,
): Promise<ProgressionTimelineSaveResult> {
  const ids = input.items.map((item) => item.id).filter((v): v is string => Boolean(v));
  if (new Set(ids).size !== ids.length) {
    throw new ContentAdminError("DUPLICATE", "节点 id 重复。");
  }
  if (input.deletedIds.some((id) => ids.includes(id))) {
    throw new ContentAdminError("DUPLICATE", "节点不能同时出现在画布与删除列表。");
  }
  if (input.currentId && !ids.includes(input.currentId)) {
    throw new ContentAdminError("NOT_FOUND", "当前阶段节点不存在。");
  }

  const existing = await prisma.progressionNode.findMany({ select: SELECT });
  const existingById = new Map(existing.map((n) => [n.id.toString(), n]));
  for (const id of ids) {
    if (!existingById.has(id)) {
      throw new ContentAdminError("NOT_FOUND", "渐进节点不存在。");
    }
  }
  const removed = [...new Set(input.deletedIds)].filter((id) => existingById.has(id));

  const pointer = await prisma.systemConfig.findUnique({
    where: { key: POINTER_KEY },
    select: { value: true },
  });
  const pointerCleared = Boolean(
    pointer && removed.includes(pointer.value) && input.currentId === null,
  );

  const result = await prisma.$transaction(async (tx) => {
    if (removed.length > 0) {
      await tx.progressionNode.deleteMany({
        where: { id: { in: removed.map((id) => BigInt(id)) } },
      });
    }
    const savedIds: string[] = [];
    let created = 0;
    let updated = 0;
    for (const [index, item] of input.items.entries()) {
      const data = {
        title: item.title,
        phaseDate: item.phaseDate ? new Date(`${item.phaseDate}T00:00:00Z`) : null,
        imageUrl: item.imageUrl ?? null,
        bodyMd: item.bodyMd ?? null,
        status: item.status,
        icon: item.icon ?? null,
        sort: index + 1,
      };
      if (item.id) {
        const row = existingById.get(item.id);
        const unchanged =
          row &&
          row.title === data.title &&
          (row.phaseDate ? row.phaseDate.toISOString().slice(0, 10) : null) === item.phaseDate &&
          row.imageUrl === data.imageUrl &&
          row.bodyMd === data.bodyMd &&
          row.status === data.status &&
          row.icon === data.icon &&
          row.sort === data.sort;
        if (!unchanged) {
          await tx.progressionNode.update({ where: { id: BigInt(item.id) }, data });
          updated += 1;
        }
        savedIds.push(item.id);
      } else {
        const node = await tx.progressionNode.create({ data, select: { id: true } });
        savedIds.push(node.id.toString());
        created += 1;
      }
    }
    if (input.currentId === null) {
      await tx.systemConfig.deleteMany({ where: { key: POINTER_KEY } });
    } else {
      await tx.systemConfig.upsert({
        where: { key: POINTER_KEY },
        update: { value: input.currentId },
        create: { key: POINTER_KEY, value: input.currentId },
      });
    }
    return {
      items: savedIds.map((id) => ({ id })),
      created,
      updated,
      deleted: removed.length,
    };
  });

  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_PROGRESSION_SAVED,
    actorUserId,
    payload: {
      created: result.created,
      updated: result.updated,
      deleted: result.deleted,
      current: input.currentId,
    },
  });
  return { ...result, pointerCleared };
}

/** 删除:为当前指针节点时同清指针行(运行期回退末位 open),审计注明 pointerCleared */
export async function deleteProgressionNode(id: bigint, actorUserId: bigint): Promise<void> {
  const pointer = await prisma.systemConfig.findUnique({
    where: { key: POINTER_KEY },
    select: { value: true },
  });
  const pointerCleared = pointer?.value === id.toString();
  await prisma.$transaction([
    prisma.progressionNode.delete({ where: { id } }),
    ...(pointerCleared ? [prisma.systemConfig.delete({ where: { key: POINTER_KEY } })] : []),
  ]);
  await writeAudit({
    category: AUDIT_CATEGORY.CONTENT,
    action: AUDIT_ACTION.CONTENT_PROGRESSION_DELETED,
    actorUserId,
    payload: { id: id.toString(), pointerCleared },
  });
}
