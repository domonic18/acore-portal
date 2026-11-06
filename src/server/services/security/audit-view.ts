import "server-only";
import type { Prisma } from "@/generated/business";
import { prisma } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { checkLock } from "@/lib/redis/rate-limit";
import { AUDIT_ACTION, AUDIT_CATEGORY } from "@/constants/audit";
import { ADMIN_SECURITY_PAGE_SIZE } from "@/constants/pagination";
import {
  loginIpLockKey,
  loginLockKey,
  SECURITY_DASHBOARD_WINDOW_SEC,
} from "@/constants/security";
import { queryAuditLog, type AuditEntryDto } from "@/server/services/shared/audit";

/**
 * 安全看板视图模型(2026-11-06 撞库加固 PR-J,F11):
 * audit_log 此前**只写不读**——撞库既无法界定受害账号,也无法复盘。
 * 这里把审计流水读成三类可判读的信号:
 * - **嫌疑来源 IP**:失败数 + 命中账号数(喷洒广度)——撞库与手抖的区别就在广度;
 * - **被锁账号**:哪些账号已被锁(可能是被撞的受害方);
 * - **近期审计**:原始流水,供逐条追溯。
 *
 * 聚合走 SQL(COUNT/GROUP BY/JSON 提取)而非拉行回内存算:
 * 攻击下审计行可达十万级,拉回内存既慢又占内存。
 */

type Num = bigint | number | Prisma.Decimal;

/** 嫌疑来源 IP 的条数上限(防一次拉爆;默认页长) */
const OFFENDER_LIMIT_MAX = 200;

function toNumber(v: Num | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** 嫌疑来源 IP(按失败数倒序,取前 N) */
export type SecurityOffender = {
  ip: string;
  fails: number;
  /** 命中过的不同账号数(喷洒广度):单账号反复试 = 1,横扫一片 = 几十上百 */
  targets: number;
  lastAt: string;
  /** 该 IP 当前是否仍被锁(Redis 显式锁,TTL 到期即自动解锁) */
  locked: boolean;
};

/** 近期被锁账号(锁定事件来自审计流,当前锁态来自 Redis) */
export type SecurityLockedAccount = {
  username: string;
  ip: string | null;
  fails: number;
  lockedAt: string;
  /** 当前是否仍处于锁定期 */
  locked: boolean;
};

export type SecurityDashboardView = {
  /** 聚合窗口小时数 */
  windowHours: number;
  generatedAt: string;
  totals: {
    failed: number;
    succeeded: number;
    /** 窗口内失败数越阈的来源 IP 数 */
    offenderIps: number;
    /** 窗口内被锁账号数(去重) */
    lockedAccounts: number;
  };
  offenders: SecurityOffender[];
  lockedAccounts: SecurityLockedAccount[];
  recent: { items: AuditEntryDto[]; nextCursor: bigint | null };
};

/**
 * 按 IP 聚合失败数与命中账号数。
 *
 * 命中账号的口径:未知用户名的失败记在 payload.username(登录名),
 * 已知账号的失败记在 actor_user_id——两者用 CONCAT 归一后按去重计数,
 * 一个 IP 打穿几十个不同账号才叫「撞库」。
 */
async function queryOffenders(
  since: Date,
  limit: number,
): Promise<SecurityOffender[]> {
  const rows = await prisma.$queryRaw<
    { ip: string; fails: Num; targets: Num; last_at: Date }[]
  >`
    SELECT COALESCE(\`ip\`, 'unknown') AS ip,
           COUNT(*) AS fails,
           COUNT(DISTINCT COALESCE(
             NULLIF(JSON_UNQUOTE(JSON_EXTRACT(\`payload_json\`, '$.username')), ''),
             CONCAT('id:', COALESCE(CAST(\`actor_user_id\` AS CHAR), 'null'))
           )) AS targets,
           MAX(\`created_at\`) AS last_at
    FROM \`audit_log\`
    WHERE \`category\` = 'security'
      AND \`action\` IN ('login_failed', 'login_failed_unknown')
      AND \`created_at\` >= ${since}
    GROUP BY COALESCE(\`ip\`, 'unknown')
    ORDER BY fails DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => ({
    ip: r.ip,
    fails: toNumber(r.fails),
    targets: toNumber(r.targets),
    lastAt: new Date(r.last_at).toISOString(),
    locked: false,
  }));
}

/** 失败数越阈的来源 IP 个数(不分 TOP,看板给的是「有多少个来源」而非「最坏的几个」) */
async function countOffenderIps(since: Date, threshold: number): Promise<number> {
  const rows = await prisma.$queryRaw<{ c: Num }[]>`
    SELECT COUNT(*) AS c FROM (
      SELECT COALESCE(\`ip\`, 'unknown') AS ip
      FROM \`audit_log\`
      WHERE \`category\` = 'security'
        AND \`action\` IN ('login_failed', 'login_failed_unknown')
        AND \`created_at\` >= ${since}
      GROUP BY COALESCE(\`ip\`, 'unknown')
      HAVING COUNT(*) >= ${threshold}
    ) AS t
  `;
  return toNumber(rows.at(0)?.c);
}

/** 窗口内被锁账号(取最近若干条锁定事件,按用户名去重保留最新一条) */
async function queryLockedAccounts(since: Date): Promise<SecurityLockedAccount[]> {
  const rows = await prisma.auditLog.findMany({
    where: {
      category: AUDIT_CATEGORY.SECURITY,
      action: AUDIT_ACTION.LOGIN_LOCKED,
      createdAt: { gte: since },
    },
    orderBy: { id: "desc" },
    take: 200,
    select: { payloadJson: true, ip: true, createdAt: true },
  });
  const seen = new Set<string>();
  const list: SecurityLockedAccount[] = [];
  for (const r of rows) {
    const payload = (r.payloadJson ?? {}) as Record<string, unknown>;
    const username = typeof payload.username === "string" ? payload.username : null;
    if (!username || seen.has(username)) continue;
    seen.add(username);
    list.push({
      username,
      ip: r.ip,
      fails: typeof payload.fails === "number" ? payload.fails : 0,
      lockedAt: r.createdAt.toISOString(),
      locked: false,
    });
    if (list.length >= ADMIN_SECURITY_PAGE_SIZE) break;
  }
  return list;
}

/**
 * 安全看板视图(PR-J)。
 *
 * @param opts.threshold 失败数越阈线(来源 IP 计数与告警共用同一阈值)
 * @param opts.cursor    近期审计的游标(上一页最后一条 id)
 * @param opts.limit     嫌疑来源 IP 的条数(默认页长;上限封顶,防一次拉爆)
 */
export async function getSecurityDashboardView(opts?: {
  threshold?: number;
  cursor?: bigint | null;
  limit?: number;
}): Promise<SecurityDashboardView> {
  const { security } = await getConfig();
  const since = new Date(Date.now() - SECURITY_DASHBOARD_WINDOW_SEC * 1000);
  // 越阈线与告警同口径(登录域软阈):看板说「多少个来源越阈」与告警说「同一个来源」是同一件事
  const threshold = Math.max(1, Math.floor(opts?.threshold ?? security.loginIpSoftFails));
  const offenderLimit = Math.min(
    OFFENDER_LIMIT_MAX,
    Math.max(1, Math.floor(opts?.limit ?? ADMIN_SECURITY_PAGE_SIZE)),
  );

  const [byAction, offenders, offenderIpCount, lockedAccounts, recent] =
    await Promise.all([
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { category: AUDIT_CATEGORY.SECURITY, createdAt: { gte: since } },
        _count: { _all: true },
      }),
      queryOffenders(since, offenderLimit),
      countOffenderIps(since, threshold),
      queryLockedAccounts(since),
      queryAuditLog({
        category: AUDIT_CATEGORY.SECURITY,
        since,
        limit: ADMIN_SECURITY_PAGE_SIZE,
        cursor: opts?.cursor ?? null,
      }),
    ]);

  const countOf = (action: string) =>
    byAction.find((r) => r.action === action)?._count._all ?? 0;

  // 当前锁态来自 Redis 显式锁(TTL 到期自动解锁)——审计只说「曾经锁过」
  const [offenderLocks, accountLocks] = await Promise.all([
    Promise.all(
      offenders.map(async (o) => ({
        ip: o.ip,
        locked: (await checkLock(loginIpLockKey(o.ip))).locked,
      })),
    ),
    Promise.all(
      lockedAccounts.map(async (a) => ({
        username: a.username,
        locked: (await checkLock(loginLockKey(a.username))).locked,
      })),
    ),
  ]);
  const ipLockMap = new Map(offenderLocks.map((x) => [x.ip, x.locked]));
  const accountLockMap = new Map(accountLocks.map((x) => [x.username, x.locked]));

  return {
    windowHours: Math.round(SECURITY_DASHBOARD_WINDOW_SEC / 3600),
    generatedAt: new Date().toISOString(),
    totals: {
      failed: countOf(AUDIT_ACTION.LOGIN_FAILED) + countOf(AUDIT_ACTION.LOGIN_FAILED_UNKNOWN),
      succeeded: countOf(AUDIT_ACTION.LOGIN_SUCCESS),
      offenderIps: offenderIpCount,
      lockedAccounts: lockedAccounts.length,
    },
    offenders: offenders.map((o) => ({ ...o, locked: ipLockMap.get(o.ip) ?? false })),
    lockedAccounts: lockedAccounts.map((a) => ({
      ...a,
      locked: accountLockMap.get(a.username) ?? false,
    })),
    recent,
  };
}
