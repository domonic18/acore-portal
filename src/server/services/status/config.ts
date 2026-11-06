import "server-only";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getConfig, reloadSystemConfig } from "@/lib/config";
import { PROGRESSION_CURRENT_NODE_KEY, STATUS_CONFIG_KEYS, STATUS_REDIS_KEYS } from "@/constants/status";
import { writeAudit } from "@/server/services/shared/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";

/**
 * 服务器状态「人工三键」配置(T045;quickstart S6.5):
 * 展示开关 / 维护模式 / 当前阶段指针——与探针读取分离(探针见 status.ts)。
 */

export type StatusConfigInput = {
  enabled?: boolean;
  maintenanceMode?: boolean;
  currentNodeId?: bigint;
};

export type SaveStatusConfigResult = { pointerInvalid: boolean };

/** 后台表单初值:原始指针(system_config 存储值,不经运行期回退) */
export async function getRawStatusConfig(): Promise<{
  enabled: boolean;
  maintenanceMode: boolean;
  currentNodeId: string | null;
}> {
  const [config, pointer] = await Promise.all([
    getConfig(),
    prisma.systemConfig.findUnique({
      where: { key: PROGRESSION_CURRENT_NODE_KEY },
      select: { value: true },
    }),
  ]);
  return {
    enabled: config.status.enabled,
    maintenanceMode: config.status.maintenanceMode,
    currentNodeId: pointer?.value ?? null,
  };
}

/**
 * 人工三键写入:PUT 后 reloadSystemConfig 即时生效,
 * 审计 status_config_change 前后值;指针失效仍落库(运行期回退末位 open)+告警位。
 */
export async function saveStatusConfig(
  input: StatusConfigInput,
  actor: { id: bigint },
): Promise<SaveStatusConfigResult> {
  const KEYS = {
    enabled: STATUS_CONFIG_KEYS.enabled,
    maintenanceMode: STATUS_CONFIG_KEYS.maintenanceMode,
    currentNodeId: PROGRESSION_CURRENT_NODE_KEY,
  } as const;

  const before: Record<string, string | null> = {};
  const after: Record<string, string | null> = {};
  const updates: { key: string; value: string }[] = [];

  let pointerInvalid = false;
  if (input.currentNodeId !== undefined) {
    const node = await prisma.progressionNode.findUnique({
      where: { id: input.currentNodeId },
      select: { id: true },
    });
    pointerInvalid = node === null;
  }

  const pairs: [string, string | undefined][] = [
    [KEYS.enabled, input.enabled === undefined ? undefined : String(input.enabled)],
    [
      KEYS.maintenanceMode,
      input.maintenanceMode === undefined ? undefined : String(input.maintenanceMode),
    ],
    [
      KEYS.currentNodeId,
      input.currentNodeId === undefined ? undefined : input.currentNodeId.toString(),
    ],
  ];
  for (const [key, value] of pairs) {
    if (value === undefined) continue;
    const prior = await prisma.systemConfig.findUnique({ where: { key } });
    before[key] = prior?.value ?? null;
    after[key] = value;
    updates.push({ key, value });
  }

  await prisma.$transaction(
    updates.map((u) =>
      prisma.systemConfig.upsert({
        where: { key: u.key },
        create: { key: u.key, value: u.value },
        update: { value: u.value },
      }),
    ),
  );
  await reloadSystemConfig();
  // 指针变更后作废状态快照:否则状态卡的当前阶段名最多滞后一个缓存 TTL(25s)
  if (input.currentNodeId !== undefined) {
    try {
      await redis.del(STATUS_REDIS_KEYS.probe);
    } catch {
      // Redis 故障不阻断保存:快照滞后一个 TTL 后由下次探针自愈
    }
  }
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.STATUS_CONFIG_CHANGE,
    actorUserId: actor.id,
    payload: { before, after, ...(pointerInvalid ? { pointerInvalid: true } : {}) },
  });
  return { pointerInvalid };
}
