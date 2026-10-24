import "server-only";
import { prisma } from "@/lib/db";
import { redis } from "@/lib/redis";
import { getConfig, reloadSystemConfig } from "@/lib/config";
import { getCharactersDb } from "@/lib/db/characters";
import { rawExecuteCommand } from "@/server/soap/client";
import { resolveProgressionPosition } from "@/server/services/progression/progression";
import { writeAudit } from "@/server/services/audit/audit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { ALLIANCE_RACES, HORDE_RACES } from "@/constants/characters";

/**
 * 服务器状态探针(T043,FR-221;Q6 字段二分/p15 定案):
 * SOAP .server info(可达性/uptime/队列文本解析)+ characters 只读统计(在线/阵营比/
 * 总数/今日新注册)+ system_config 人工项(维护/开关/渐进指针)。
 * Redis status:probe TTL 25s(降级态同样缓存,SOAP 宕机不放大重试风暴);
 * 峰值日键 status:peak:{yyyyMMdd} 仅探针成功 max 更新,TTL 48h。
 * 探针失败→回退消费一次的上次成功快照+degraded(「数据延迟」;消费后不陈旧长挂);
 * 无回退位(冷启动/持续故障)→数字字段 null(SC-208,宁显式空不给陈旧)。
 */

const PROBE_CACHE_KEY = "status:probe";
// 上次成功快照存档(成功探针写入;失败回退时消费一次),TTL 48h 仅防悬空
const PROBE_LASTOK_KEY = "status:probe:lastok";
const PROBE_TTL_SECONDS = 25;
const PROBE_TIMEOUT_MS = 2_000;
const PEAK_TTL_SECONDS = 48 * 3600;

export type ServerStatusPayload = {
  enabled: true;
  degraded: boolean;
  online: boolean;
  onlineCount: number | null;
  allianceCount: number | null;
  hordeCount: number | null;
  uptimeText: string | null;
  queueCount: number | null;
  todayPeak: number | null;
  charTotal: number | null;
  todayNewChars: number | null;
  currentStage: string | null;
  maintenanceMode: boolean;
  updatedAt: string;
};

export type ServerStatusResult = ServerStatusPayload | { enabled: false };

export function todayPeakKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `status:peak:${yyyy}${mm}${dd}`;
}

/** .server info 文本解析(契约 §5:mock 固定样例;真机格式差异入 launch-checklist 核对) */
export function parseServerInfo(text: string): {
  uptimeText: string | null;
  queueCount: number | null;
} {
  const uptime = /^Uptime:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? null;
  const queue = /Connection queue:\s*(\d+)/.exec(text);
  return { uptimeText: uptime, queueCount: queue ? Number(queue[1]) : null };
}

type ProbeSnapshot = {
  ok: boolean;
  online: boolean;
  onlineCount: number | null;
  allianceCount: number | null;
  hordeCount: number | null;
  uptimeText: string | null;
  queueCount: number | null;
  charTotal: number | null;
  todayNewChars: number | null;
  todayPeak: number | null;
  cachedAt: string;
};

async function charactersStats(db: Awaited<ReturnType<typeof getCharactersDb>>) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const [onlineCount, charTotal, byRace, todayNewChars] = await Promise.all([
    db.characters.count({ where: { online: 1 } }),
    db.characters.count(),
    db.characters.groupBy({
      by: ["race"],
      where: { online: 1 },
      _count: { race: true },
    }),
    db.characters.count({
      where: { createDate: { gte: Math.floor(startOfDay.getTime() / 1000) } },
    }),
  ]);
  let allianceCount = 0;
  let hordeCount = 0;
  for (const g of byRace) {
    if (ALLIANCE_RACES.has(g.race)) allianceCount += g._count.race;
    else if (HORDE_RACES.has(g.race)) hordeCount += g._count.race;
  }
  return { onlineCount, charTotal, allianceCount, hordeCount, todayNewChars };
}

/** 探针成功路径更新今日峰值(max 语义;失败不调用) */
async function updateTodayPeak(onlineCount: number): Promise<number> {
  const key = todayPeakKey();
  const current = await redis.get(key);
  const value = current === null || onlineCount > Number(current) ? onlineCount : Number(current);
  await redis.set(key, String(value), "EX", PEAK_TTL_SECONDS);
  return value;
}

async function runProbe(): Promise<ProbeSnapshot> {
  const cachedAt = new Date().toISOString();
  const soap = await rawExecuteCommand(".server info", PROBE_TIMEOUT_MS)
    .then((text) => ({ ok: true as const, ...parseServerInfo(text) }))
    .catch(() => ({ ok: false as const, uptimeText: null, queueCount: null }));

  let stats: Awaited<ReturnType<typeof charactersStats>> | null = null;
  try {
    stats = await charactersStats(await getCharactersDb());
  } catch {
    stats = null;
  }

  // 失败即全空(SC-208):SOAP 与统计任一失败都不出半真半假的数字
  if (!soap.ok || stats === null) {
    return {
      ok: false,
      online: soap.ok,
      onlineCount: null,
      allianceCount: null,
      hordeCount: null,
      uptimeText: null,
      queueCount: null,
      charTotal: null,
      todayNewChars: null,
      todayPeak: null,
      cachedAt,
    };
  }

  const todayPeak = await updateTodayPeak(stats.onlineCount);
  return {
    ok: true,
    online: true,
    onlineCount: stats.onlineCount,
    allianceCount: stats.allianceCount,
    hordeCount: stats.hordeCount,
    uptimeText: soap.uptimeText,
    queueCount: soap.queueCount,
    charTotal: stats.charTotal,
    todayNewChars: stats.todayNewChars,
    todayPeak,
    cachedAt,
  };
}

function toPayload(
  snap: ProbeSnapshot,
  currentStage: string | null,
  maintenanceMode: boolean,
): ServerStatusPayload {
  return {
    enabled: true,
    degraded: !snap.ok,
    online: snap.online,
    onlineCount: snap.onlineCount,
    allianceCount: snap.allianceCount,
    hordeCount: snap.hordeCount,
    uptimeText: snap.uptimeText,
    queueCount: snap.queueCount,
    todayPeak: snap.todayPeak,
    charTotal: snap.charTotal,
    todayNewChars: snap.todayNewChars,
    currentStage,
    maintenanceMode,
    updatedAt: snap.cachedAt,
  };
}

/** /api/status 聚合入口:enabled=false 短路;缓存命中(含降级态)直返 */
export async function getServerStatus(): Promise<ServerStatusResult> {
  const config = await getConfig();
  if (!config.status.enabled) return { enabled: false };

  const cached = await redis.get(PROBE_CACHE_KEY);
  let snap: ProbeSnapshot;
  if (cached) {
    snap = JSON.parse(cached) as ProbeSnapshot;
  } else {
    snap = await runProbe();
    if (snap.ok) {
      await redis.set(PROBE_LASTOK_KEY, JSON.stringify(snap), "EX", PEAK_TTL_SECONDS);
    } else {
      const lastok = await redis.get(PROBE_LASTOK_KEY);
      if (lastok) {
        await redis.del(PROBE_LASTOK_KEY);
        snap = { ...(JSON.parse(lastok) as ProbeSnapshot), ok: false };
      }
    }
    await redis.set(PROBE_CACHE_KEY, JSON.stringify(snap), "EX", PROBE_TTL_SECONDS);
  }

  const position = await resolveProgressionPosition();
  return toPayload(snap, position.current?.title ?? null, config.status.maintenanceMode);
}

export type StatusConfigInput = {
  enabled?: boolean;
  maintenanceMode?: boolean;
  currentNodeId?: bigint;
};

export type SaveStatusConfigResult = { pointerInvalid: boolean };

/**
 * 人工三键写入(T045;quickstart S6.5):PUT 后 reloadSystemConfig 即时生效,
 * 审计 status_config_change 前后值;指针失效仍落库(运行期回退末位 open)+告警位。
 */
export async function saveStatusConfig(
  input: StatusConfigInput,
  actor: { id: bigint },
): Promise<SaveStatusConfigResult> {
  const KEYS = {
    enabled: "status.enabled",
    maintenanceMode: "status.maintenance_mode",
    currentNodeId: "progression.current_node_id",
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
  await writeAudit({
    category: AUDIT_CATEGORY.ADMIN,
    action: AUDIT_ACTION.STATUS_CONFIG_CHANGE,
    actorUserId: actor.id,
    payload: { before, after, ...(pointerInvalid ? { pointerInvalid: true } : {}) },
  });
  return { pointerInvalid };
}
