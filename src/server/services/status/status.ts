import "server-only";
import { randomUUID } from "node:crypto";
import { redis } from "@/lib/redis";
import { maxCounter } from "@/lib/redis/counters";
import { releaseLockIfOwner, setLockIfAbsent } from "@/lib/redis/rate-limit";
import {
  STATUS_PROBE_TIMEOUT_MS,
  STATUS_PROBE_WAIT_INTERVAL_MS,
  STATUS_PROBE_WAIT_MS,
  STATUS_REDIS_KEYS,
} from "@/constants/status";
import { getConfig } from "@/lib/config";
import { getCharactersDb } from "@/lib/db/characters";
import type { ServerStatusPayload, ServerStatusResult } from "@/lib/status-types";
import { rawExecuteCommand } from "@/server/soap/client";
import { parseServerInfo } from "@/server/services/status/parse";
import { resolveProgressionPosition } from "@/server/services/progression/progression";
import { ALLIANCE_RACES, HORDE_RACES } from "@/constants/characters";

/**
 * 服务器状态探针(T043,FR-221;Q6 字段二分/p15 定案):
 * SOAP .server info(可达性/uptime/队列文本解析)+ characters 只读统计(在线/阵营比/
 * 总数/今日新注册)+ system_config 人工项(维护/开关/渐进指针)。
 * Redis status:probe TTL 25s(降级态同样缓存,SOAP 宕机不放大重试风暴);
 * 峰值日键 status:peak:{yyyyMMdd} 仅探针成功 max 更新,TTL 48h。
 * 探针失败→回退消费一次的上次成功快照+degraded(「数据延迟」;消费后不陈旧长挂);
 * 无回退位(冷启动/持续故障)→数字字段 null(SC-208,宁显式空不给陈旧)。
 *
 * 单飞(2026-11-06 撞库加固 PR-H):缓存未命中时只放一个探针出去,
 * 其余请求轮询等快照落缓存(F9:并发缓存未命中 → 并发 SOAP 打世界服)。
 */

const PROBE_CACHE_KEY = STATUS_REDIS_KEYS.probe;
// 上次成功快照存档(成功探针写入;失败回退时消费一次),TTL 48h 仅防悬空
const PROBE_LASTOK_KEY = STATUS_REDIS_KEYS.probeLastok;
const PROBE_TTL_SECONDS = STATUS_REDIS_KEYS.probeTtlSeconds;
const PROBE_TIMEOUT_MS = STATUS_PROBE_TIMEOUT_MS;
const PEAK_TTL_SECONDS = STATUS_REDIS_KEYS.peakTtlSeconds;
const PROBE_LOCK_KEY = STATUS_REDIS_KEYS.probeLock;
const PROBE_LOCK_TTL_SECONDS = STATUS_REDIS_KEYS.probeLockTtlSeconds;

export type { ServerStatusPayload, ServerStatusResult };

export function todayPeakKey(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${STATUS_REDIS_KEYS.peakPrefix}${yyyy}${mm}${dd}`;
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
  /** 当前阶段标题(随快照缓存;指针变更时由后台作废快照) */
  stageTitle: string | null;
  /** 当前阶段节点 id(字符串化:BigInt 不可 JSON 序列化) */
  stageNodeId: string | null;
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
      where: { createDate: { gte: startOfDay } },
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

/** 探针成功路径更新今日峰值(max 语义;失败不调用;原子取大值防并发覆盖,issue #77) */
async function updateTodayPeak(onlineCount: number): Promise<number> {
  return maxCounter(todayPeakKey(), onlineCount, PEAK_TTL_SECONDS);
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
      stageTitle: null,
      stageNodeId: null,
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
    stageTitle: null,
    stageNodeId: null,
    cachedAt,
  };
}

function toPayload(snap: ProbeSnapshot, maintenanceMode: boolean): ServerStatusPayload {
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
    currentStage: snap.stageTitle ?? null,
    currentStageNodeId: snap.stageNodeId ? Number(snap.stageNodeId) : null,
    maintenanceMode,
    updatedAt: snap.cachedAt,
  };
}

/** 当前阶段指针(与探针成败无关:SOAP 挂了也不该丢阶段名) */
async function resolveStagePointer(): Promise<{ title: string | null; nodeId: string | null }> {
  try {
    const { current } = await resolveProgressionPosition();
    return {
      title: current?.title ?? null,
      nodeId: current ? current.id.toString() : null,
    };
  } catch {
    return { title: null, nodeId: null };
  }
}

/**
 * 产出一次探针快照并写入缓存(25s)+ 上次成功存档(48h)。
 * 降级回退:探针失败且有存档 → 消费一次存档并标 ok=false(数据延迟,不长挂陈旧)。
 */
async function produceSnapshot(): Promise<ProbeSnapshot> {
  let snap = await runProbe();
  if (snap.ok) {
    await redis.set(PROBE_LASTOK_KEY, JSON.stringify(snap), "EX", PEAK_TTL_SECONDS);
  } else {
    const lastok = await redis.get(PROBE_LASTOK_KEY);
    if (lastok) {
      await redis.del(PROBE_LASTOK_KEY);
      snap = { ...(JSON.parse(lastok) as ProbeSnapshot), ok: false };
    }
  }
  const stage = await resolveStagePointer();
  snap = { ...snap, stageTitle: stage.title, stageNodeId: stage.nodeId };
  await redis.set(PROBE_CACHE_KEY, JSON.stringify(snap), "EX", PROBE_TTL_SECONDS);
  return snap;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 单飞取快照:缓存命中直返;未命中时抢 status:probe:lock——
 * 抢到者探针并写缓存;未抢到者轮询等缓存出现(持锁者通常 1s 内写完),
 * 等不到(持锁者超时挂死)则自己探一次,宁可多探也不给空响应。
 */
async function getOrProbeSnapshot(): Promise<ProbeSnapshot> {
  const cached = await redis.get(PROBE_CACHE_KEY);
  if (cached) return JSON.parse(cached) as ProbeSnapshot;

  const owner = randomUUID();
  const acquired = await setLockIfAbsent(PROBE_LOCK_KEY, PROBE_LOCK_TTL_SECONDS, owner);
  if (acquired) {
    try {
      return await produceSnapshot();
    } finally {
      await releaseLockIfOwner(PROBE_LOCK_KEY, owner);
    }
  }

  const deadline = Date.now() + STATUS_PROBE_WAIT_MS;
  while (Date.now() < deadline) {
    await sleep(STATUS_PROBE_WAIT_INTERVAL_MS);
    const fresh = await redis.get(PROBE_CACHE_KEY);
    if (fresh) return JSON.parse(fresh) as ProbeSnapshot;
  }
  return produceSnapshot();
}

/** /api/status 聚合入口:enabled=false 短路;缓存命中(含降级态)直返 */
export async function getServerStatus(): Promise<ServerStatusResult> {
  const config = await getConfig();
  if (!config.status.enabled) return { enabled: false };

  const snap = await getOrProbeSnapshot();
  return toPayload(snap, config.status.maintenanceMode);
}
