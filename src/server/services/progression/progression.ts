import "server-only";
import { prisma } from "@/lib/db";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { writeAudit } from "@/server/services/audit/audit";
import { ContentAdminError } from "@/server/services/content/admin";

/**
 * 渐进计划(M3 US3 T022;R8 人工指针):
 * 时间轴 phaseDate 升序 NULLS LAST;当前=system_config 指针
 * progression.current_node_id,指针缺省/指向已删节点回退时间轴末位 open。
 * 后台 CRUD(T048 契约补全 api-admin-m3):删除当前指针节点同清指针行并审计注明;
 * 审计只记 id/status/sort,不记标题/正文(T048 脱敏口径)。
 */

const POINTER_KEY = "progression.current_node_id";

const ORDER_BY = [
  { phaseDate: { sort: "asc" as const, nulls: "last" as const } },
  { sort: "asc" as const },
  { id: "asc" as const },
];

const SELECT = {
  id: true,
  title: true,
  phaseDate: true,
  imageUrl: true,
  bodyMd: true,
  status: true,
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
  sort: number;
  actorUserId: bigint;
}): Promise<{ id: bigint }> {
  const data = {
    title: input.title,
    phaseDate: input.phaseDate ? new Date(`${input.phaseDate}T00:00:00Z`) : null,
    imageUrl: input.imageUrl ?? null,
    bodyMd: input.bodyMd ?? null,
    status: input.status,
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
