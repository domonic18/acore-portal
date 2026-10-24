import "server-only";
import { prisma } from "@/lib/db";

/**
 * 渐进计划(M3 US3 T022;R8 人工指针):
 * 时间轴 phaseDate 升序 NULLS LAST;当前=system_config 指针
 * progression.current_node_id,指针缺省/指向已删节点回退时间轴末位 open。
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
